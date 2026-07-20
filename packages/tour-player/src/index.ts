/**
 * 巡游播放控制器（任务 T-P0-14 / 修复 E-26）。
 *
 * TourPlayerImpl 把 CruiseService 串联成一条完整的播放控制管线，提供
 * load/play/pause/resume/seek/exit 等播放控制接口，并通过 requestAnimationFrame
 * 驱动 CruiseService.update(deltaTime) 推进巡游进度。
 *
 * 设计要点：
 * - requestAnimationFrame / cancelAnimationFrame 可注入，便于在 Node / 单元测试
 *   环境中驱动，也可直接调用 frame(deltaTime) 手动推进单帧；
 * - 状态机：idle → paused(loaded) → playing → paused → ... → ended → idle；
 * - seek 通过 startCruise + update(targetElapsed) 重定位，保留播放/暂停状态；
 * - 巡游结束（CruiseService 内部 stopCruise 触发 getCurrentWaypoint 返回 null）
 *   时自动停止 RAF 循环并进入 ended 状态。
 */

import type { Cruise, CruiseService, CruiseWaypoint } from '@solar-system/renderer-core';
import { CruiseServiceImpl } from '@solar-system/renderer-core';

/** TourPlayer 状态机。 */
export type TourPlayerState = 'idle' | 'paused' | 'playing' | 'ended';

/**
 * TourPlayer 所需的 CruiseService 契约。
 *
 * 标准 CruiseService 接口未暴露 update(deltaTime)，但 CruiseServiceImpl 实现了它。
 * 这里通过结构化类型扩展，使 TourPlayer 既能接受 CruiseServiceImpl，也能接受
 * 任何实现了 update(deltaTime) 的自定义 CruiseService。
 */
export interface TourPlayerCruiseService extends CruiseService {
  /** 推进巡游时间，更新当前 waypoint 与进度。 */
  update(deltaTime: number): void;
}

export type RequestAnimationFrameLike = (callback: (timestamp: number) => void) => number;
export type CancelAnimationFrameLike = (handle: number) => void;

export interface TourPlayerOptions {
  /** 自定义 requestAnimationFrame，默认使用全局实现（Node 下回退到 setTimeout）。 */
  requestAnimationFrame?: RequestAnimationFrameLike;
  /** 自定义 cancelAnimationFrame，默认使用全局实现（Node 下回退到 clearTimeout）。 */
  cancelAnimationFrame?: CancelAnimationFrameLike;
}

const defaultRequestAnimationFrame: RequestAnimationFrameLike = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  const ts =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return setTimeout(() => callback(ts), 16) as unknown as number;
};

const defaultCancelAnimationFrame: CancelAnimationFrameLike = (handle) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

/**
 * 探索状态快照（FR-TOUR-005）。
 *
 * 进入巡航前保存的自由探索状态，退出巡航时恢复。
 */
export interface ExplorationSnapshot {
  /** 相机位置。 */
  cameraPosition: { x: number; y: number; z: number } | null;
  /** 相机目标点。 */
  cameraTarget: { x: number; y: number; z: number } | null;
  /** 模拟时间（MJD）。 */
  simulationTime: number | null;
  /** 时间倍率。 */
  timeRate: number | null;
  /** 时间是否暂停。 */
  timePaused: boolean | null;
  /** 尺度模式。 */
  scaleMode: 'real' | 'enhanced' | null;
}

/**
 * 探索状态捕获/恢复接口（FR-TOUR-005）。
 *
 * 由外部（如 AppOrchestrator）实现，TourPlayer 在进入巡航前调用 capture()
 * 保存当前探索状态，退出巡航时调用 restore() 恢复。
 */
export interface ExplorationStateProvider {
  capture(): ExplorationSnapshot;
  restore(snapshot: ExplorationSnapshot): void;
}

export interface TourPlayer {
  load(cruiseId: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(progress: number): void;
  exit(): void;
  getState(): TourPlayerState;
  getCurrentCruise(): Cruise | null;
  getCurrentWaypoint(): CruiseWaypoint | null;
  getCurrentWaypointIndex(): number;
  getProgress(): number;
  /** FR-TOUR-005：设置探索状态捕获/恢复提供者。 */
  setExplorationStateProvider?(provider: ExplorationStateProvider | null): void;
  /** FR-TOUR-005：获取进入巡航前保存的探索状态快照。 */
  getExplorationSnapshot?(): ExplorationSnapshot | null;
}

export class TourPlayerImpl implements TourPlayer {
  private readonly cruiseService: TourPlayerCruiseService;
  private readonly raf: RequestAnimationFrameLike;
  private readonly caf: CancelAnimationFrameLike;

  private state: TourPlayerState = 'idle';
  private currentCruise: Cruise | null = null;
  private rafHandle: number | null = null;
  private lastTimestamp: number | null = null;
  /** FR-TOUR-005：探索状态捕获/恢复提供者。 */
  private explorationProvider: ExplorationStateProvider | null = null;
  /** FR-TOUR-005：进入巡航前保存的探索状态快照。 */
  private explorationSnapshot: ExplorationSnapshot | null = null;

  constructor(cruiseService?: TourPlayerCruiseService, options?: TourPlayerOptions) {
    this.cruiseService =
      cruiseService ?? (new CruiseServiceImpl() as TourPlayerCruiseService);
    this.raf = options?.requestAnimationFrame ?? defaultRequestAnimationFrame;
    this.caf = options?.cancelAnimationFrame ?? defaultCancelAnimationFrame;
  }

  /** FR-TOUR-005：设置探索状态捕获/恢复提供者。 */
  setExplorationStateProvider(provider: ExplorationStateProvider | null): void {
    this.explorationProvider = provider;
  }

  /** FR-TOUR-005：获取进入巡航前保存的探索状态快照。 */
  getExplorationSnapshot(): ExplorationSnapshot | null {
    return this.explorationSnapshot;
  }

  /** 加载指定 ID 的巡游并暂停在起点。 */
  load(cruiseId: string): void {
    const cruise = this.cruiseService.getCruise(cruiseId);
    if (!cruise) {
      throw new Error(`Cruise not found: ${cruiseId}`);
    }
    // FR-TOUR-005：进入巡航前保存当前探索状态
    if (this.explorationProvider && this.state === 'idle') {
      this.explorationSnapshot = this.explorationProvider.capture();
    }
    this.stopLoop();
    this.currentCruise = cruise;
    this.cruiseService.startCruise(cruiseId);
    this.cruiseService.pauseCruise();
    this.state = 'paused';
  }

  /** 开始播放。若未加载则抛错；若已在播放则为 no-op。 */
  play(): void {
    if (this.state === 'idle' || this.currentCruise === null) {
      throw new Error('No cruise loaded. Call load() first.');
    }
    if (this.state === 'playing') return;
    // 若已结束，重新从头播放
    if (this.state === 'ended') {
      this.cruiseService.startCruise(this.currentCruise.id);
    } else {
      this.cruiseService.resumeCruise();
    }
    this.state = 'playing';
    this.startLoop();
  }

  /** 暂停播放。非播放状态为 no-op。 */
  pause(): void {
    if (this.state !== 'playing') return;
    this.cruiseService.pauseCruise();
    this.stopLoop();
    this.state = 'paused';
  }

  /** 恢复播放。非暂停状态为 no-op。 */
  resume(): void {
    if (this.state !== 'paused') return;
    this.cruiseService.resumeCruise();
    this.state = 'playing';
    this.startLoop();
  }

  /** 跳转到指定进度（0-100），保留播放/暂停状态。 */
  seek(progress: number): void {
    if (this.currentCruise === null) return;
    const clamped = Math.max(0, Math.min(100, progress));
    const totalMs = this.currentCruise.totalDuration * 60 * 1000;
    const targetElapsed = (clamped / 100) * totalMs;

    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.stopLoop();
    }

    // 重启巡游（重置 elapsedTime=0）后跳转到目标时间
    this.cruiseService.startCruise(this.currentCruise.id);
    this.cruiseService.update(targetElapsed);

    if (wasPlaying) {
      this.state = 'playing';
      this.cruiseService.resumeCruise();
      this.startLoop();
    } else {
      this.cruiseService.pauseCruise();
      this.state = 'paused';
    }
  }

  /**
   * 退出巡游，清理资源（FR-TOUR-005）。
   *
   * 退出时恢复进入巡航前的自由探索状态（相机/时间/尺度），
   * 使退出后回到合理的自由探索状态，而非空白或巡航结束位置。
   */
  exit(): void {
    this.stopLoop();
    this.cruiseService.stopCruise();
    this.currentCruise = null;
    this.state = 'idle';

    // FR-TOUR-005：恢复进入巡航前的探索状态
    if (this.explorationProvider && this.explorationSnapshot) {
      this.explorationProvider.restore(this.explorationSnapshot);
      this.explorationSnapshot = null;
    }
  }

  getState(): TourPlayerState {
    return this.state;
  }

  getCurrentCruise(): Cruise | null {
    return this.currentCruise;
  }

  getCurrentWaypoint(): CruiseWaypoint | null {
    return this.cruiseService.getCurrentWaypoint();
  }

  /** 返回当前 waypoint 在巡游中的索引（从 0 开始）；未播放返回 -1。 */
  getCurrentWaypointIndex(): number {
    const cruise = this.currentCruise;
    const waypoint = this.cruiseService.getCurrentWaypoint();
    if (!cruise || !waypoint) return -1;
    // CruiseService.getCurrentWaypoint() 返回的是 cruise.waypoints 数组中的对象引用，
    // 因此可用 indexOf 进行引用相等比较。
    return cruise.waypoints.indexOf(waypoint);
  }

  getProgress(): number {
    return this.cruiseService.getCurrentProgress();
  }

  /** requestAnimationFrame 回调：由时间戳计算 deltaTime 后调用 frame()。 */
  private tick = (timestamp: number): void => {
    if (this.state !== 'playing') return;
    const deltaTime = this.lastTimestamp === null ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.frame(deltaTime);
    if (this.state === 'playing') {
      this.rafHandle = this.raf(this.tick);
    }
  };

  /**
   * 推进单帧。可由内部 raf 循环驱动，也可在测试中手动调用。
   *
   * 内部调用 CruiseService.update(deltaTime) 推进进度；若 update 后
   * getCurrentWaypoint() 返回 null，说明巡游已结束。
   */
  private frame(deltaTime: number): void {
    this.cruiseService.update(deltaTime);
    const waypoint = this.cruiseService.getCurrentWaypoint();
    if (waypoint === null) {
      // 巡游已结束（CruiseServiceImpl.update 在末尾调用 stopCruise）
      this.stopLoop();
      this.state = 'ended';
    }
  }

  private startLoop(): void {
    this.lastTimestamp = null;
    this.rafHandle = this.raf(this.tick);
  }

  private stopLoop(): void {
    if (this.rafHandle !== null) {
      this.caf(this.rafHandle);
      this.rafHandle = null;
    }
  }
}

/** 创建 TourPlayer 实例的工厂函数。 */
export function createTourPlayer(
  cruiseService?: TourPlayerCruiseService,
  options?: TourPlayerOptions,
): TourPlayer {
  return new TourPlayerImpl(cruiseService, options);
}
