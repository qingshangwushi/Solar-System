/**
 * TourPlayer 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/tour-player` 中 `TourPlayer` 接口：
 * - MockTourPlayer 实现 TourPlayer 接口（编译时 + 运行时）
 * - play / pause / seek / exit 状态机
 * - getCurrentCruise / getCurrentWaypoint / getProgress 查询方法
 *
 * 注：当前 TourPlayer 接口未定义 subscribe 事件流；状态变化通过 getState 查询。
 */
import { describe, it, expect } from 'vitest';
import {
  TourPlayerImpl,
  createTourPlayer,
  type TourPlayer,
  type TourPlayerState,
} from '@solar-system/tour-player';
import type { Cruise, CruiseWaypoint } from '@solar-system/renderer-core';

// ---------------------------------------------------------------------------
// MockTourPlayer：完整实现 TourPlayer 接口。
// ---------------------------------------------------------------------------

class MockTourPlayer implements TourPlayer {
  private state: TourPlayerState = 'idle';
  private currentCruise: Cruise | null = null;
  private currentWaypoint: CruiseWaypoint | null = null;
  private currentWaypointIndex = -1;
  private progress = 0;

  loadCalls = 0;
  playCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;
  seekCalls = 0;
  exitCalls = 0;

  load(cruiseId: string): void {
    this.loadCalls += 1;
    if (cruiseId === 'unknown') {
      throw new Error(`Cruise not found: ${cruiseId}`);
    }
    this.currentCruise = {
      id: cruiseId,
      name: 'mock',
      description: 'mock cruise',
      waypoints: [],
      totalDuration: 60,
      recommendedTime: '2025-01-01',
      featured: false,
    };
    this.state = 'paused';
  }

  play(): void {
    this.playCalls += 1;
    if (this.state === 'idle' || !this.currentCruise) {
      throw new Error('No cruise loaded. Call load() first.');
    }
    this.state = 'playing';
  }

  pause(): void {
    this.pauseCalls += 1;
    if (this.state !== 'playing') return;
    this.state = 'paused';
  }

  resume(): void {
    this.resumeCalls += 1;
    if (this.state !== 'paused') return;
    this.state = 'playing';
  }

  seek(progress: number): void {
    this.seekCalls += 1;
    this.progress = Math.max(0, Math.min(100, progress));
  }

  exit(): void {
    this.exitCalls += 1;
    this.state = 'idle';
    this.currentCruise = null;
    this.currentWaypoint = null;
    this.currentWaypointIndex = -1;
    this.progress = 0;
  }

  getState(): TourPlayerState {
    return this.state;
  }

  getCurrentCruise(): Cruise | null {
    return this.currentCruise;
  }

  getCurrentWaypoint(): CruiseWaypoint | null {
    return this.currentWaypoint;
  }

  getCurrentWaypointIndex(): number {
    return this.currentWaypointIndex;
  }

  getProgress(): number {
    return this.progress;
  }
}

// ---------------------------------------------------------------------------
// 编译时类型断言：MockTourPlayer 必须可赋值给 TourPlayer 接口。
// ---------------------------------------------------------------------------
const _typeCheck: TourPlayer = new MockTourPlayer();
void _typeCheck;

// ---------------------------------------------------------------------------

describe('TourPlayer 接口契约', () => {
  it('MockTourPlayer 实现 TourPlayer 接口且所有方法存在', () => {
    const p: TourPlayer = new MockTourPlayer();

    expect(typeof p.load).toBe('function');
    expect(typeof p.play).toBe('function');
    expect(typeof p.pause).toBe('function');
    expect(typeof p.resume).toBe('function');
    expect(typeof p.seek).toBe('function');
    expect(typeof p.exit).toBe('function');
    expect(typeof p.getState).toBe('function');
    expect(typeof p.getCurrentCruise).toBe('function');
    expect(typeof p.getCurrentWaypoint).toBe('function');
    expect(typeof p.getCurrentWaypointIndex).toBe('function');
    expect(typeof p.getProgress).toBe('function');

    // 初始状态
    expect(p.getState()).toBe('idle');
    expect(p.getCurrentCruise()).toBeNull();
    expect(p.getCurrentWaypoint()).toBeNull();
    expect(p.getCurrentWaypointIndex()).toBe(-1);
    expect(p.getProgress()).toBe(0);
  });

  it('play/pause/seek/exit 状态机转换正确', () => {
    const p = new MockTourPlayer();

    // 未 load 时 play 抛错
    expect(() => p.play()).toThrow(/No cruise loaded/);

    // load 后进入 paused
    p.load('cruise-1');
    expect(p.getState()).toBe('paused');
    expect(p.getCurrentCruise()?.id).toBe('cruise-1');

    // play 后进入 playing
    p.play();
    expect(p.getState()).toBe('playing');

    // pause 后回到 paused
    p.pause();
    expect(p.getState()).toBe('paused');

    // resume 后回到 playing
    p.resume();
    expect(p.getState()).toBe('playing');

    // seek 保留 playing 状态（progress 被裁剪到 [0, 100]）
    p.seek(50);
    expect(p.getProgress()).toBe(50);
    p.seek(200);
    expect(p.getProgress()).toBe(100);
    p.seek(-10);
    expect(p.getProgress()).toBe(0);

    // exit 后回到 idle 并清空状态
    p.exit();
    expect(p.getState()).toBe('idle');
    expect(p.getCurrentCruise()).toBeNull();
    expect(p.getProgress()).toBe(0);
  });

  it('createTourPlayer 工厂返回符合 TourPlayer 接口的对象', () => {
    // 工厂函数返回值必须可赋值给 TourPlayer 接口（编译时类型断言）
    const p: TourPlayer = createTourPlayer();
    expect(p).toBeInstanceOf(TourPlayerImpl);

    // 初始状态查询
    expect(p.getState()).toBe('idle');
    expect(p.getCurrentCruise()).toBeNull();
    expect(p.getCurrentWaypointIndex()).toBe(-1);
    expect(p.getProgress()).toBe(0);

    // 所有方法存在
    expect(typeof p.load).toBe('function');
    expect(typeof p.play).toBe('function');
    expect(typeof p.pause).toBe('function');
    expect(typeof p.seek).toBe('function');
    expect(typeof p.exit).toBe('function');
  });
});
