/**
 * 天文内核 Worker 入口（设计文档 9.1、8.2、42 节）。
 *
 * 在 Web Worker 中加载 WASM，处理主线程 RPC 请求与流式快照推送。
 * Worker 崩溃后主线程可重新初始化（设计文档 8.2 稳定性）。
 *
 * 该文件作为 Worker 入口（new Worker(new URL('./astro-core-worker.ts', import.meta.url))）。
 */
import type {
  WorkerControlMessage,
  WorkerInbound,
  WorkerOutbound,
  WorkerRequest,
  WorkerResponse,
  WorkerStreamMessage,
} from './protocol.js';
import { createAstroCoreWasm, type AstroCoreWasmInstance } from '@solar-system/astro-core-wasm';

/** Worker 内部状态。 */
interface WorkerState {
  wasm: AstroCoreWasmInstance | null;
  wasmUrl: string | null;
  ready: boolean;
}

const state: WorkerState = {
  wasm: null,
  wasmUrl: null,
  ready: false,
};

/** 发送流式消息至主线程。 */
function sendStream(msg: WorkerStreamMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

/** 发送 RPC 响应至主线程。 */
function sendResponse(requestId: string, payload: WorkerResponse['payload']): void {
  const resp: WorkerResponse = { request_id: requestId, payload };
  (self as unknown as Worker).postMessage(resp);
}

/** 发送错误响应。 */
function sendError(
  requestId: string,
  code: 'OUT_OF_RANGE' | 'UNSUPPORTED' | 'INVALID_ARGUMENT' | 'INTERNAL' | 'DEGRADED' | 'TOUR_RESOURCES_MISSING',
  messageZh: string,
): void {
  sendResponse(requestId, { ok: false, error: { code, message_zh: messageZh } });
}

/** 初始化 WASM。 */
async function init(wasmUrl: string): Promise<void> {
  if (state.wasm) {
    state.wasm.free();
    state.wasm = null;
  }
  state.wasmUrl = wasmUrl;
  state.wasm = await createAstroCoreWasm(wasmUrl);
  state.ready = true;
  sendStream({ kind: 'worker_ready' });
}

/** 处理 RPC 请求。 */
async function handleRequest(req: WorkerRequest): Promise<void> {
  if (!state.wasm) {
    sendError(req.request_id, 'INTERNAL', 'WASM 未初始化');
    return;
  }
  const wasm = state.wasm;
  const p = req.payload;
  try {
    switch (p.method) {
      case 'clock.getUtc':
      case 'clock.getTdb':
        sendResponse(req.request_id, { ok: true, result: null });
        return;
      case 'clock.setUtc':
      case 'clock.setRate':
      case 'clock.pause':
      case 'clock.resume':
      case 'clock.step':
        sendResponse(req.request_id, { ok: true, result: null });
        return;
      case 'ephemeris.supports':
        sendResponse(req.request_id, { ok: true, result: false });
        return;
      case 'ephemeris.query': {
        try {
          const result = wasm.evaluateState(BigInt(p.body_id), p.tdb);
          sendResponse(req.request_id, { ok: true, result });
        } catch (e) {
          sendError(req.request_id, 'UNSUPPORTED', (e as Error).message);
        }
        return;
      }
      case 'ephemeris.getCoverage':
        sendResponse(req.request_id, { ok: true, result: null });
        return;
      case 'state.evaluate': {
        try {
          const result = wasm.evaluateState(BigInt(p.body_id), p.tdb);
          sendResponse(req.request_id, { ok: true, result });
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes('OUT_OF_RANGE') || msg.includes('范围')) {
            sendError(req.request_id, 'OUT_OF_RANGE', msg);
          } else {
            sendError(req.request_id, 'UNSUPPORTED', msg);
          }
        }
        return;
      }
      case 'state.sampleOrbit': {
        try {
          const result = wasm.sampleOrbit(
            BigInt(p.body_id),
            p.tdb_start,
            p.tdb_end,
            (p.tdb_end - p.tdb_start) / Math.max(1, p.samples),
          );
          sendResponse(req.request_id, { ok: true, result });
        } catch (e) {
          sendError(req.request_id, 'UNSUPPORTED', (e as Error).message);
        }
        return;
      }
      case 'event.search':
        sendResponse(req.request_id, { ok: true, result: [] });
        return;
      case 'event.refine':
      case 'event.buildObservationPlan':
      case 'event.getUncertainty':
        sendError(req.request_id, 'UNSUPPORTED', '事件引擎尚未实现');
        return;
      case 'render.setFocusBody':
      case 'render.setScaleProfile':
      case 'render.setQualityProfile':
      case 'render.setLayerVisibility':
      case 'render.requestCameraTransition':
        sendResponse(req.request_id, { ok: true, result: null });
        return;
      case 'tour.load':
        sendError(req.request_id, 'TOUR_RESOURCES_MISSING', '巡航资源未安装');
        return;
      case 'tour.validateResources':
        sendResponse(req.request_id, { ok: true, result: { ok: false, missing_packages: [] } });
        return;
      case 'tour.play':
      case 'tour.pause':
      case 'tour.seek':
      case 'tour.exit':
        sendResponse(req.request_id, { ok: true, result: null });
        return;
      case 'tour.getCurrentNode':
        sendResponse(req.request_id, {
          ok: true,
          result: { tour_id: '', current_node_index: 0, current_node_id: '', progress: 0, is_playing: false },
        });
        return;
      default: {
        // 穷尽性检查
        const _exhaustive: never = p;
        void _exhaustive;
        sendError(req.request_id, 'INVALID_ARGUMENT', `未知方法: ${JSON.stringify(p)}`);
      }
    }
  } catch (e) {
    sendError(req.request_id, 'INTERNAL', (e as Error).message);
  }
}

/** Worker 消息处理。 */
async function onMessage(event: MessageEvent): Promise<void> {
  const msg = event.data as WorkerInbound;
  if ('kind' in msg) {
    // 控制消息
    const ctrl = msg as WorkerControlMessage;
    if (ctrl.kind === 'init' || ctrl.kind === 'reinit') {
      try {
        await init(ctrl.wasm_url);
      } catch (e) {
        sendStream({ kind: 'worker_error', worker_error: { code: 'INTERNAL', message_zh: (e as Error).message } });
      }
    } else if (ctrl.kind === 'dispose') {
      if (state.wasm) {
        state.wasm.free();
        state.wasm = null;
      }
      state.ready = false;
    }
    return;
  }
  // RPC 请求
  await handleMessage(msg as WorkerRequest);
}

function handleMessage(req: WorkerRequest): Promise<void> {
  return handleRequest(req);
}

// 注册消息监听
(self as unknown as Worker).addEventListener('message', (e: MessageEvent) => {
  void onMessage(e);
});

// 导出消息类型供类型推导
export type { WorkerOutbound };
