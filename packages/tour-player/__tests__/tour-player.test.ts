/**
 * TourPlayerImpl 单元测试（任务 T-P0-14 / 修复 E-26）。
 *
 * 验证：
 * - load/play/pause/resume/seek/exit 状态机正确性；
 * - getCurrentCruise/getCurrentWaypoint/getCurrentWaypointIndex/getProgress 读取；
 * - RAF 循环驱动 CruiseService.update 推进进度；
 * - 巡游结束自动进入 ended 状态，play() 可重新播放。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TourPlayerImpl, createTourPlayer, type TourPlayerCruiseService } from '../src/index.js';
import type { Cruise, CruiseWaypoint, CruiseService } from '@solar-system/renderer-core';

/** 构造可控的 requestAnimationFrame / cancelAnimationFrame mock。 */
function createControllableRaf() {
  let callback: ((ts: number) => void) | null = null;
  let nextHandle = 1;
  const activeHandles = new Set<number>();
  const raf = vi.fn((cb: (ts: number) => void) => {
    callback = cb;
    const handle = nextHandle++;
    activeHandles.add(handle);
    return handle;
  });
  const caf = vi.fn((h: number) => {
    activeHandles.delete(h);
    if (activeHandles.size === 0) {
      callback = null;
    }
  });
  const fire = (ts: number): void => {
    if (callback !== null) {
      callback(ts);
    }
  };
  return { raf, caf, fire };
}

/** 构造一个最小巡游用于测试。 */
function createTestCruise(): Cruise {
  const waypoints: CruiseWaypoint[] = [
    { bodyId: 'sun', name: '太阳', position: { x: 0, y: 0, z: 0 }, duration: 1, pauseDuration: 0 },
    { bodyId: 'earth', name: '地球', position: { x: 1, y: 0, z: 0 }, duration: 1, pauseDuration: 0 },
  ];
  return {
    id: 'test-cruise',
    name: '测试巡游',
    description: '用于单元测试',
    waypoints,
    totalDuration: 2,
    recommendedTime: '任意',
    featured: false,
  };
}

/**
 * 构造一个可控的 CruiseService mock，实现 CruiseService + update(deltaTime)。
 *
 * update(deltaTime) 累加 elapsedTime，按 waypoint.duration+pauseDuration 推进当前索引；
 * 超过最后一个 waypoint 时调用 stopCruise（模拟 CruiseServiceImpl 行为）。
 */
function createMockCruiseService(cruise: Cruise): TourPlayerCruiseService & {
  updateSpy: ReturnType<typeof vi.fn>;
  startCruiseSpy: ReturnType<typeof vi.fn>;
  pauseCruiseSpy: ReturnType<typeof vi.fn>;
  resumeCruiseSpy: ReturnType<typeof vi.fn>;
  stopCruiseSpy: ReturnType<typeof vi.fn>;
} {
  let currentCruise: Cruise | null = null;
  let currentWaypointIndex = 0;
  let isPaused = false;
  let elapsedTime = 0;

  const service: CruiseService = {
    getAllCruises: () => [cruise],
    getCruise: (id: string) => (id === cruise.id ? cruise : null),
    getFeaturedCruises: () => [],
    startCruise: vi.fn((_id: string) => {
      currentCruise = cruise;
      currentWaypointIndex = 0;
      isPaused = false;
      elapsedTime = 0;
    }),
    pauseCruise: vi.fn(() => {
      isPaused = true;
    }),
    resumeCruise: vi.fn(() => {
      isPaused = false;
    }),
    stopCruise: vi.fn(() => {
      currentCruise = null;
      currentWaypointIndex = 0;
      isPaused = false;
      elapsedTime = 0;
    }),
    getCurrentProgress: () => {
      if (!currentCruise) return 0;
      if (isPaused) return Math.min(100, (elapsedTime / (cruise.totalDuration * 60 * 1000)) * 100);
      return Math.min(100, (elapsedTime / (cruise.totalDuration * 60 * 1000)) * 100);
    },
    getCurrentWaypoint: () => {
      if (!currentCruise || currentWaypointIndex >= cruise.waypoints.length) return null;
      return cruise.waypoints[currentWaypointIndex] ?? null;
    },
  };

  const updateSpy = vi.fn((deltaTime: number) => {
    if (!currentCruise || isPaused) return;
    elapsedTime += deltaTime;
    let accumulated = 0;
    for (let i = 0; i < cruise.waypoints.length; i++) {
      const wp = cruise.waypoints[i];
      if (!wp) continue;
      const wpTotal = (wp.duration + wp.pauseDuration) * 60 * 1000;
      if (elapsedTime < accumulated + wpTotal) {
        currentWaypointIndex = i;
        return;
      }
      accumulated += wpTotal;
      if (i === cruise.waypoints.length - 1) {
        // 巡游结束：调用 stopCruise
        currentCruise = null;
        currentWaypointIndex = 0;
        isPaused = false;
        elapsedTime = 0;
        return;
      }
    }
  });

  const extended = {
    ...service,
    update: updateSpy,
  } as TourPlayerCruiseService;

  return Object.assign(extended, {
    updateSpy,
    startCruiseSpy: service.startCruise as ReturnType<typeof vi.fn>,
    pauseCruiseSpy: service.pauseCruise as ReturnType<typeof vi.fn>,
    resumeCruiseSpy: service.resumeCruise as ReturnType<typeof vi.fn>,
    stopCruiseSpy: service.stopCruise as ReturnType<typeof vi.fn>,
  });
}

describe('TourPlayerImpl (E-26)', () => {
  let cruise: Cruise;
  let mockService: ReturnType<typeof createMockCruiseService>;

  beforeEach(() => {
    cruise = createTestCruise();
    mockService = createMockCruiseService(cruise);
  });

  describe('load()', () => {
    it('should load cruise and set state to paused', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      expect(player.getState()).toBe('paused');
      expect(player.getCurrentCruise()).toBe(cruise);
      expect(mockService.startCruiseSpy).toHaveBeenCalledWith('test-cruise');
    });

    it('should throw when cruiseId is not found', () => {
      const player = new TourPlayerImpl(mockService);
      expect(() => player.load('non-existent')).toThrow('Cruise not found: non-existent');
    });

    it('should set current waypoint to first waypoint after load', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      expect(player.getCurrentWaypoint()).toBe(cruise.waypoints[0]);
      expect(player.getCurrentWaypointIndex()).toBe(0);
    });
  });

  describe('play() / pause() / resume()', () => {
    it('should throw when play() called without load()', () => {
      const player = new TourPlayerImpl(mockService);
      expect(() => player.play()).toThrow('No cruise loaded');
    });

    it('should transition to playing state on play()', () => {
      const { raf, caf } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      expect(player.getState()).toBe('playing');
      expect(raf).toHaveBeenCalled();
    });

    it('should transition to paused state on pause()', () => {
      const { raf, caf } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      player.pause();
      expect(player.getState()).toBe('paused');
      expect(mockService.pauseCruiseSpy).toHaveBeenCalled();
      expect(caf).toHaveBeenCalled();
    });

    it('should transition back to playing on resume()', () => {
      const { raf, caf } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      player.pause();
      player.resume();
      expect(player.getState()).toBe('playing');
      expect(mockService.resumeCruiseSpy).toHaveBeenCalled();
    });

    it('pause() should be no-op when not playing', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      // load() 内部会调用一次 pauseCruise 把状态设为 paused
      const callsAfterLoad = mockService.pauseCruiseSpy.mock.calls.length;
      player.pause();
      expect(player.getState()).toBe('paused');
      // pause() 不应额外调用 pauseCruise
      expect(mockService.pauseCruiseSpy.mock.calls.length).toBe(callsAfterLoad);
    });
  });

  describe('seek()', () => {
    it('should reposition to target progress while paused', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      player.seek(50);
      expect(player.getState()).toBe('paused');
      // seek(50) → targetElapsed = 0.5 * 2 * 60 * 1000 = 60000ms
      // 第一个 waypoint 总时长 = (1+0)*60*1000 = 60000ms
      // elapsedTime=60000 不在 [0, 60000) 内，进入第二个 waypoint
      expect(mockService.updateSpy).toHaveBeenCalledWith(60000);
      expect(player.getCurrentWaypointIndex()).toBe(1);
    });

    it('should clamp progress to [0, 100]', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      player.seek(200);
      // 应被 clamp 到 100
      expect(mockService.updateSpy).toHaveBeenCalledWith(2 * 60 * 1000);
      player.seek(-50);
      // 应被 clamp 到 0
      expect(mockService.updateSpy).toHaveBeenLastCalledWith(0);
    });

    it('should be no-op when no cruise is loaded', () => {
      const player = new TourPlayerImpl(mockService);
      player.seek(50);
      expect(mockService.updateSpy).not.toHaveBeenCalled();
    });

    it('should preserve playing state after seek', () => {
      const { raf, caf } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      player.seek(50);
      expect(player.getState()).toBe('playing');
      expect(mockService.resumeCruiseSpy).toHaveBeenCalled();
    });
  });

  describe('exit()', () => {
    it('should reset to idle state and clear cruise', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      player.exit();
      expect(player.getState()).toBe('idle');
      expect(player.getCurrentCruise()).toBeNull();
      expect(mockService.stopCruiseSpy).toHaveBeenCalled();
    });

    it('should stop RAF loop if running', () => {
      const { raf, caf } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      player.exit();
      expect(caf).toHaveBeenCalled();
      expect(player.getState()).toBe('idle');
    });
  });

  describe('RAF loop & cruise end', () => {
    it('should drive CruiseService.update via RAF and advance waypoint', () => {
      const { raf, caf, fire } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();

      // 第一帧：deltaTime=0（lastTimestamp=0 时跳过）
      fire(0);
      expect(mockService.updateSpy).toHaveBeenCalledWith(0);

      // 第二帧：deltaTime=30000ms（30秒），仍在第一个 waypoint（0-60s）
      fire(30000);
      expect(mockService.updateSpy).toHaveBeenLastCalledWith(30000);
      expect(player.getCurrentWaypointIndex()).toBe(0);

      // 第三帧：再过 30000ms（累计 60s），进入第二个 waypoint
      fire(60000);
      expect(player.getCurrentWaypointIndex()).toBe(1);
    });

    it('should enter ended state when cruise finishes', () => {
      const { raf, caf, fire } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();

      // 第一帧
      fire(0);
      // 推进到第二个 waypoint 之后（累计 > 120000ms = 2分钟 = totalDuration）
      // 此时 mock 会触发 stopCruise，getCurrentWaypoint 返回 null
      fire(200000);
      expect(player.getState()).toBe('ended');
      expect(caf).toHaveBeenCalled();
    });

    it('should restart from beginning when play() called after ended', () => {
      const { raf, caf, fire } = createControllableRaf();
      const player = new TourPlayerImpl(mockService, {
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf,
      });
      player.load('test-cruise');
      player.play();
      fire(0);
      fire(200000); // 巡游结束
      expect(player.getState()).toBe('ended');

      // 重新播放
      player.play();
      expect(player.getState()).toBe('playing');
      expect(mockService.startCruiseSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProgress() & getCurrentWaypointIndex()', () => {
    it('should return 0 progress when idle', () => {
      const player = new TourPlayerImpl(mockService);
      expect(player.getProgress()).toBe(0);
      expect(player.getCurrentWaypointIndex()).toBe(-1);
    });

    it('should return current waypoint index correctly', () => {
      const player = new TourPlayerImpl(mockService);
      player.load('test-cruise');
      expect(player.getCurrentWaypointIndex()).toBe(0);
      player.seek(75);
      expect(player.getCurrentWaypointIndex()).toBe(1);
    });
  });

  describe('createTourPlayer() factory', () => {
    it('should create a working TourPlayer instance', () => {
      const player = createTourPlayer(mockService);
      expect(player).toBeInstanceOf(TourPlayerImpl);
      player.load('test-cruise');
      expect(player.getState()).toBe('paused');
    });

    it('should default to CruiseServiceImpl when no service provided', () => {
      const player = createTourPlayer();
      player.load('cruise-sun-corona');
      expect(player.getState()).toBe('paused');
      expect(player.getCurrentCruise()?.id).toBe('cruise-sun-corona');
    });
  });
});
