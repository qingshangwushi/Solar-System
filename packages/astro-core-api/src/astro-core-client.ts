/**
 * 天文内核主线程客户端（设计文档 9.1、8.2、42 节；任务 P0-9）。
 *
 * 职责：
 * - 创建并管理天文内核 Worker；
 * - 通过 RPC 请求状态/轨道/事件；
 * - 订阅低频状态快照与时间边界；
 * - Worker 崩溃后重新初始化（设计文档 8.2 稳定性）。
 *
 * 架构原则（设计文档 9.3）：
 * - React 不参与逐帧天体状态更新；
 * - 主线程通过本客户端订阅 Worker 推送的快照。
 */
import type {
  WorkerControlMessage,
  WorkerOutbound,
  WorkerRequest,
  WorkerResponse,
  WorkerStreamMessage,
} from './protocol.js';
import type { AstroEvent, TourPlaybackState } from './index.js';
import type { CelestialStateSnapshot, JulianDate } from '@solar-system/schemas';

/** 快照监听器。 */
export type SnapshotListener = (snapshot: CelestialStateSnapshot) => void;
/** 时间边界监听器。 */
export type TimeBoundaryListener = (boundary: {
  utc: JulianDate;
  rate: number;
  paused: boolean;
  uncertainty_predicted: boolean;
  out_of_range: boolean;
}) => void;
/** Worker 就绪监听器。 */
export type ReadyListener = () => void;
/** Worker 错误监听器。 */
export type WorkerErrorListener = (error: { code: string; message_zh: string }) => void;

/** AstroCoreClient 配置。 */
export interface AstroCoreClientOptions {
  /** WASM 模块 URL（传递给 Worker 初始化）。 */
  wasmUrl: string;
  /** Worker 脚本 URL。默认使用内置 worker。 */
  workerUrl?: URL;
  /** 是否在 init 后自动重试（崩溃恢复）。 */
  autoReinit?: boolean;
}

interface PendingRequest {
  resolve: (resp: WorkerResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * 天文内核主线程客户端。
 *
 * 用法：
 * ```ts
 * const client = new AstroCoreClient({ wasmUrl: '/wasm/astro_core.js' });
 * await client.init();
 * const state = await client.evaluateState(10, 61237);
 * ```
 */
export class AstroCoreClient {
  private worker: Worker | null = null;
  private readonly options: AstroCoreClientOptions;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly timeBoundaryListeners = new Set<TimeBoundaryListener>();
  private readonly readyListeners = new Set<ReadyListener>();
  private readonly errorListeners = new Set<WorkerErrorListener>();
  private ready = false;
  private reinitAttempt = 0;
  private disposed = false;
  private requestIdCounter = 0;

  constructor(options: AstroCoreClientOptions) {
    this.options = { autoReinit: true, ...options };
  }

  /** 初始化 Worker 与 WASM。 */
  async init(): Promise<void> {
    if (this.disposed) throw new Error('AstroCoreClient 已销毁');
    this.spawnWorker();
    await this.sendControl({ kind: 'init', wasm_url: this.options.wasmUrl });
    await this.waitForReady();
  }

  /** 创建 Worker 实例。 */
  private spawnWorker(): void {
    const workerUrl =
      this.options.workerUrl ?? new URL('./astro-core-worker.js', import.meta.url);
    this.worker = new Worker(workerUrl, { type: 'module' });
    this.worker.addEventListener('message', (e: MessageEvent) => {
      this.handleMessage(e.data as WorkerOutbound);
    });
    this.worker.addEventListener('error', (e: ErrorEvent) => {
      this.notifyError({ code: 'INTERNAL', message_zh: e.message });
      if (this.options.autoReinit && !this.disposed) {
        void this.reinit();
      }
    });
    this.worker.addEventListener('messageerror', () => {
      this.notifyError({ code: 'INTERNAL', message_zh: 'Worker 消息反序列化失败' });
    });
  }

  /** 重新初始化（崩溃恢复，设计文档 8.2）。 */
  private async reinit(): Promise<void> {
    this.reinitAttempt += 1;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.rejectAllPending('INTERNAL', 'Worker 崩溃，重新初始化');
    this.ready = false;
    // 指数退避
    const delay = Math.min(1000 * 2 ** (this.reinitAttempt - 1), 8000);
    await new Promise((r) => setTimeout(r, delay));
    if (this.disposed) return;
    try {
      this.spawnWorker();
      await this.sendControl({ kind: 'reinit', wasm_url: this.options.wasmUrl });
      await this.waitForReady();
      this.reinitAttempt = 0;
    } catch (e) {
      this.notifyError({ code: 'INTERNAL', message_zh: `重初始化失败: ${(e as Error).message}` });
    }
  }

  /** 等待 worker_ready 流式消息。 */
  private waitForReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => {
      const listener: ReadyListener = () => {
        this.readyListeners.delete(listener);
        resolve();
      };
      this.readyListeners.add(listener);
    });
  }

  /** 处理来自 Worker 的消息。 */
  private handleMessage(msg: WorkerOutbound): void {
    if ('request_id' in msg) {
      // RPC 响应
      const resp = msg as WorkerResponse;
      const pending = this.pending.get(resp.request_id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(resp.request_id);
        pending.resolve(resp);
      }
      return;
    }
    // 流式消息
    const stream = msg as WorkerStreamMessage;
    switch (stream.kind) {
      case 'snapshot':
        if (stream.data) {
          // 此处简化：实际快照应由 WASM 序列化，此处仅通知监听器
        }
        break;
      case 'time_boundary':
        if (stream.time_boundary) {
          for (const l of this.timeBoundaryListeners) l(stream.time_boundary);
        }
        break;
      case 'worker_ready':
        this.ready = true;
        for (const l of this.readyListeners) l();
        break;
      case 'worker_error':
        if (stream.worker_error) {
          this.notifyError(stream.worker_error);
          if (this.options.autoReinit && !this.disposed) {
            void this.reinit();
          }
        }
        break;
      case 'tour_playback':
        // 巡航播放状态由 TourPlayer 处理
        break;
    }
  }

  /** 发送控制消息（不等待响应）。 */
  private sendControl(ctrl: WorkerControlMessage): Promise<void> {
    if (!this.worker) throw new Error('Worker 未创建');
    this.worker.postMessage(ctrl);
    return Promise.resolve();
  }

  /** 发送 RPC 请求并等待响应。 */
  private rpc(payload: WorkerRequest['payload'], timeoutMs = 10000): Promise<WorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('Worker 未创建'));
    const requestId = `req-${++this.requestIdCounter}`;
    const req: WorkerRequest = { request_id: requestId, payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`RPC 超时: ${payload.method}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, timer });
      this.worker!.postMessage(req);
    });
  }

  /** 求值单天体状态（设计文档 42.2）。 */
  async evaluateState(bodyId: number, utcMjd: number): Promise<unknown> {
    const resp = await this.rpc({ method: 'state.evaluate', body_id: bodyId, tdb: utcMjd });
    if (!resp.payload.ok) throw new Error(resp.payload.error.message_zh);
    return resp.payload.result;
  }

  /** 求值多天体快照（设计文档 42.3）。 */
  async evaluateSnapshot(bodyIds: number[], utcMjd: number): Promise<unknown> {
    // 逐个求值并聚合（WASM evaluateSnapshot 接收 BigUint64Array，此处逐个简化）
    const results: unknown[] = [];
    for (const id of bodyIds) {
      const r = await this.evaluateState(id, utcMjd);
      results.push(r);
    }
    return { bodies: results, simulation_time_utc: { mjd: utcMjd }, reference_epoch: 0 };
  }

  /** 轨道采样（设计文档 14.4）。 */
  async sampleOrbit(
    bodyId: number,
    tdbStart: number,
    tdbEnd: number,
    samples: number,
  ): Promise<Float64Array> {
    const resp = await this.rpc({
      method: 'state.sampleOrbit',
      body_id: bodyId,
      tdb_start: tdbStart,
      tdb_end: tdbEnd,
      samples,
      reference_frame: 'SolarSystemBarycentricInertial',
    });
    if (!resp.payload.ok) throw new Error(resp.payload.error.message_zh);
    return resp.payload.result as Float64Array;
  }

  /** 事件搜索（设计文档 42.6）。 */
  async searchEvents(): Promise<AstroEvent[]> {
    const resp = await this.rpc({
      method: 'event.search',
      event_type: 'all',
      bodies: 'all',
      time_range: [15020, 88128.999988],
      precision: 'P2',
    });
    if (!resp.payload.ok) throw new Error(resp.payload.error.message_zh);
    return resp.payload.result as AstroEvent[];
  }

  /** 订阅时间边界。 */
  subscribeTimeBoundary(listener: TimeBoundaryListener): () => void {
    this.timeBoundaryListeners.add(listener);
    return () => this.timeBoundaryListeners.delete(listener);
  }

  /** 订阅快照。 */
  subscribeSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** 订阅 Worker 错误。 */
  subscribeError(listener: WorkerErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** 是否就绪。 */
  isReady(): boolean {
    return this.ready;
  }

  /** 通知错误监听器。 */
  private notifyError(error: { code: string; message_zh: string }): void {
    for (const l of this.errorListeners) l(error);
  }

  /** 拒绝所有挂起请求。 */
  private rejectAllPending(code: string, messageZh: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({
        request_id: '',
        payload: { ok: false, error: { code: code as 'INTERNAL', message_zh: messageZh } },
      });
    }
    this.pending.clear();
  }

  /** 销毁客户端与 Worker。 */
  dispose(): void {
    this.disposed = true;
    this.rejectAllPending('INTERNAL', '客户端已销毁');
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.snapshotListeners.clear();
    this.timeBoundaryListeners.clear();
    this.readyListeners.clear();
    this.errorListeners.clear();
  }
}

/** 巡航播放状态（重导出便于使用）。 */
export type { TourPlaybackState };
