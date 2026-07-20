/* tslint:disable */
/* eslint-disable */

/**
 * WASM 内核句柄（设计文档 42 节接口的 WASM 实现）。
 */
export class AstroCoreWasm {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 求值多天体快照（设计文档 42.3）。
     * `body_ids` 为 JS 数组，返回 CelestialStateSnapshot。
     */
    evaluateSnapshot(body_ids: BigUint64Array, utc_mjd: number): any;
    /**
     * 求值单个天体在 UTC MJD 时刻的状态（设计文档 42.2 evaluateState）。
     * 返回 serde-wasm-bindgen 序列化的 BodyState。
     */
    evaluateState(body_id: bigint, utc_mjd: number): any;
    /**
     * 构造默认内核（内置闰秒表 + 空星历 + 空目录）。
     */
    constructor();
    /**
     * 注册一段星历（用于离线冒烟，设计文档 P0-7 内置地月样本）。
     * `body_json` 为 serde_json 序列化的 BodyEphemeris。
     * 注册后自动刷新 time_range（E-40）。
     */
    registerEphemeris(body_json: string): void;
    /**
     * 轨道采样（设计文档 14.4），返回 Float64Array 平铺数组：
     * [tdb0, x0, y0, z0, tdb1, x1, y1, z1, ...]
     */
    sampleOrbit(body_id: bigint, t_start_utc: number, t_end_utc: number, base_step_days: number): Float64Array;
    /**
     * 时间范围上界（UTC MJD）。
     */
    timeRangeMax(): number;
    /**
     * 时间范围下界（UTC MJD）。
     */
    timeRangeMin(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_astrocorewasm_free: (a: number, b: number) => void;
    readonly astrocorewasm_evaluateSnapshot: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly astrocorewasm_evaluateState: (a: number, b: bigint, c: number) => [number, number, number];
    readonly astrocorewasm_new: () => number;
    readonly astrocorewasm_registerEphemeris: (a: number, b: number, c: number) => [number, number];
    readonly astrocorewasm_sampleOrbit: (a: number, b: bigint, c: number, d: number, e: number) => [number, number, number];
    readonly astrocorewasm_timeRangeMax: (a: number) => number;
    readonly astrocorewasm_timeRangeMin: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
