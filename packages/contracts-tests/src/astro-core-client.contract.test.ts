/**
 * AstroCoreClient 接口契约测试（任务 18 / 修复 R-07）。
 *
 * 验证 `@solar-system/astro-core-api` 中 AstroCoreClient 类的公共 API：
 * - MockAstroCoreClient 结构化兼容 AstroCoreClient（编译时）
 * - evaluateState / evaluateSnapshot / sampleOrbit / searchEvents 方法签名
 * - subscribeTimeBoundary / subscribeSnapshot / subscribeError / dispose 生命周期
 *
 * 不创建真实 Worker：仅用 mock 实现验证接口契约。
 */
import { describe, it, expect } from 'vitest';
import {
  AstroCoreClient,
  type AstroCoreClientOptions,
  type TimeBoundaryListener as ClientTimeBoundaryListener,
  type SnapshotListener,
  type WorkerErrorListener,
} from '@solar-system/astro-core-api';
import type { AstroEvent } from '@solar-system/astro-core-api';

// ---------------------------------------------------------------------------
// 定义一个结构化兼容 AstroCoreClient 的 mock 类型。
// 通过 `Pick<AstroCoreClient, keyof ...>` 提取公共方法签名，
// 让 MockAstroCoreClient 实现该结构，编译时若签名漂移即报错。
// ---------------------------------------------------------------------------

type TimeBoundaryShape = Parameters<ClientTimeBoundaryListener>[0];
type SnapshotShape = Parameters<SnapshotListener>[0];
type WorkerErrorShape = Parameters<WorkerErrorListener>[0];

type AstroCoreClientLike = {
  init(): Promise<void>;
  evaluateState(bodyId: number, utcMjd: number): Promise<unknown>;
  evaluateSnapshot(bodyIds: number[], utcMjd: number): Promise<unknown>;
  sampleOrbit(
    bodyId: number,
    tdbStart: number,
    tdbEnd: number,
    samples: number,
  ): Promise<Float64Array>;
  searchEvents(): Promise<AstroEvent[]>;
  eventSearch(windowStart: number, windowEnd: number): Promise<AstroEvent[]>;
  subscribeTimeBoundary(listener: ClientTimeBoundaryListener): () => void;
  subscribeSnapshot(listener: SnapshotListener): () => void;
  subscribeError(listener: WorkerErrorListener): () => void;
  isReady(): boolean;
  dispose(): void;
};

class MockAstroCoreClient implements AstroCoreClientLike {
  initCalls = 0;
  evaluateStateCalls = 0;
  evaluateSnapshotCalls = 0;
  sampleOrbitCalls = 0;
  searchEventsCalls = 0;
  eventSearchCalls = 0;
  subscribeTimeBoundaryCalls = 0;
  subscribeSnapshotCalls = 0;
  subscribeErrorCalls = 0;
  disposeCalls = 0;
  private ready = false;
  private disposed = false;

  async init(): Promise<void> {
    this.initCalls += 1;
    this.ready = true;
  }

  async evaluateState(bodyId: number, utcMjd: number): Promise<unknown> {
    this.evaluateStateCalls += 1;
    return { body_id: bodyId, tdb: utcMjd, position: { x: 0, y: 0, z: 0 } };
  }

  async evaluateSnapshot(bodyIds: number[], utcMjd: number): Promise<unknown> {
    this.evaluateSnapshotCalls += 1;
    const bodies = await Promise.all(
      bodyIds.map((id) => this.evaluateState(id, utcMjd)),
    );
    return {
      bodies,
      simulation_time_utc: { mjd: utcMjd },
      reference_epoch: 0,
    };
  }

  async sampleOrbit(
    bodyId: number,
    tdbStart: number,
    tdbEnd: number,
    samples: number,
  ): Promise<Float64Array> {
    this.sampleOrbitCalls += 1;
    expect(bodyId).toBeGreaterThan(0);
    expect(tdbEnd).toBeGreaterThan(tdbStart);
    expect(samples).toBeGreaterThan(0);
    // 每个采样点 3 个 double（x, y, z）
    return new Float64Array(samples * 3);
  }

  async searchEvents(): Promise<AstroEvent[]> {
    this.searchEventsCalls += 1;
    return [];
  }

  async eventSearch(windowStart: number, windowEnd: number): Promise<AstroEvent[]> {
    this.eventSearchCalls += 1;
    expect(windowEnd).toBeGreaterThan(windowStart);
    return [];
  }

  subscribeTimeBoundary(_listener: ClientTimeBoundaryListener): () => void {
    this.subscribeTimeBoundaryCalls += 1;
    return () => {
      /* unsub */
    };
  }

  subscribeSnapshot(_listener: SnapshotListener): () => void {
    this.subscribeSnapshotCalls += 1;
    return () => {
      /* unsub */
    };
  }

  subscribeError(_listener: WorkerErrorListener): () => void {
    this.subscribeErrorCalls += 1;
    return () => {
      /* unsub */
    };
  }

  isReady(): boolean {
    return this.ready && !this.disposed;
  }

  dispose(): void {
    this.disposeCalls += 1;
    this.disposed = true;
    this.ready = false;
  }
}

// 保留 TimeBoundaryShape / SnapshotShape / WorkerErrorShape 仅做编译时验证
void (null as unknown as TimeBoundaryShape);
void (null as unknown as SnapshotShape);
void (null as unknown as WorkerErrorShape);

// ---------------------------------------------------------------------------
// 编译时类型断言：
// 1. MockAstroCoreClient 实现 AstroCoreClientLike（结构化兼容）。
// 2. 真实 AstroCoreClient 也满足 AstroCoreClientLike（结构化兼容）。
//    若 AstroCoreClient 类的公共方法签名变化，tsc 会立即报错。
// ---------------------------------------------------------------------------
const _mockTypeCheck: AstroCoreClientLike = new MockAstroCoreClient();
const _realTypeCheck: AstroCoreClientLike = new AstroCoreClient({
  wasmUrl: '/wasm/astro_core.js',
});
void _mockTypeCheck;
void _realTypeCheck;

// ---------------------------------------------------------------------------

describe('AstroCoreClient 接口契约', () => {
  it('MockAstroCoreClient 实现 AstroCoreClient 公共方法且签名匹配', () => {
    const client = new MockAstroCoreClient();

    expect(typeof client.init).toBe('function');
    expect(typeof client.evaluateState).toBe('function');
    expect(typeof client.evaluateSnapshot).toBe('function');
    expect(typeof client.sampleOrbit).toBe('function');
    expect(typeof client.searchEvents).toBe('function');
    expect(typeof client.eventSearch).toBe('function');
    expect(typeof client.subscribeTimeBoundary).toBe('function');
    expect(typeof client.subscribeSnapshot).toBe('function');
    expect(typeof client.subscribeError).toBe('function');
    expect(typeof client.isReady).toBe('function');
    expect(typeof client.dispose).toBe('function');

    // 方法签名参数个数
    expect(client.evaluateState.length).toBe(2); // (bodyId, utcMjd)
    expect(client.evaluateSnapshot.length).toBe(2); // (bodyIds, utcMjd)
    expect(client.sampleOrbit.length).toBe(4); // (bodyId, tdbStart, tdbEnd, samples)
    expect(client.eventSearch.length).toBe(2); // (windowStart, windowEnd)
  });

  it('evaluateState / evaluateSnapshot / sampleOrbit / eventSearch 调用与返回类型', async () => {
    const client = new MockAstroCoreClient();
    await client.init();
    expect(client.initCalls).toBe(1);
    expect(client.isReady()).toBe(true);

    // evaluateState(bodyId: number, utcMjd: number): Promise<unknown>
    const state = await client.evaluateState(10, 51544.5);
    expect(state).toBeDefined();
    expect(client.evaluateStateCalls).toBe(1);

    // evaluateSnapshot(bodyIds: number[], utcMjd: number): Promise<unknown>
    const snapshot = await client.evaluateSnapshot([10, 399, 301], 51544.5);
    expect(snapshot).toBeDefined();
    expect(client.evaluateSnapshotCalls).toBe(1);
    expect(client.evaluateStateCalls).toBe(4); // 1 + 3 from snapshot

    // sampleOrbit(bodyId, tdbStart, tdbEnd, samples): Promise<Float64Array>
    const orbit = await client.sampleOrbit(399, 51544.0, 51545.0, 100);
    expect(orbit).toBeInstanceOf(Float64Array);
    expect(orbit.length).toBe(300); // 100 samples * 3 components
    expect(client.sampleOrbitCalls).toBe(1);

    // eventSearch(windowStart, windowEnd): Promise<AstroEvent[]>
    const events = await client.eventSearch(51544.0, 51545.0);
    expect(Array.isArray(events)).toBe(true);
    expect(client.eventSearchCalls).toBe(1);

    // searchEvents(): Promise<AstroEvent[]>
    const allEvents = await client.searchEvents();
    expect(Array.isArray(allEvents)).toBe(true);
    expect(client.searchEventsCalls).toBe(1);
  });

  it('subscribe* / isReady / dispose 生命周期', () => {
    const client = new MockAstroCoreClient();

    // 未 init 时 isReady=false
    expect(client.isReady()).toBe(false);

    // 三个 subscribe 方法都返回取消订阅函数
    const unsub1 = client.subscribeTimeBoundary(() => {
      /* noop */
    });
    expect(typeof unsub1).toBe('function');
    expect(client.subscribeTimeBoundaryCalls).toBe(1);

    const unsub2 = client.subscribeSnapshot(() => {
      /* noop */
    });
    expect(typeof unsub2).toBe('function');
    expect(client.subscribeSnapshotCalls).toBe(1);

    const unsub3 = client.subscribeError(() => {
      /* noop */
    });
    expect(typeof unsub3).toBe('function');
    expect(client.subscribeErrorCalls).toBe(1);

    // init 后 isReady=true
    return client.init().then(() => {
      expect(client.isReady()).toBe(true);

      // dispose 后 isReady=false
      client.dispose();
      expect(client.disposeCalls).toBe(1);
      expect(client.isReady()).toBe(false);

      // 重复 dispose 安全
      expect(() => client.dispose()).not.toThrow();
    });
  });

  it('AstroCoreClientOptions.wasmUrl 是必需字段', () => {
    // 构造 AstroCoreClient 需要 wasmUrl（必需字段）
    const opts: AstroCoreClientOptions = {
      wasmUrl: '/wasm/astro_core.js',
    };
    expect(opts.wasmUrl).toBe('/wasm/astro_core.js');

    // autoReinit 可选
    const opts2: AstroCoreClientOptions = {
      wasmUrl: '/wasm/astro_core.js',
      autoReinit: false,
    };
    expect(opts2.autoReinit).toBe(false);

    // workerUrl 可选
    const opts3: AstroCoreClientOptions = {
      wasmUrl: '/wasm/astro_core.js',
      workerUrl: new URL('https://example.com/worker.js'),
    };
    expect(opts3.workerUrl).toBeInstanceOf(URL);
  });
});
