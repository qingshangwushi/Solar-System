/**
 * astro-core WASM 加载器（设计文档 9.1：天文内核 = Rust/WASM + Web Worker）。
 *
 * wasm-pack 在 `pkg/` 生成 `astro_core.js` + `astro_core_bg.wasm` + `astro_core.d.ts`。
 * 本模块提供类型安全的加载入口，使用动态 import，使类型检查在构建前可通过。
 */

/**
 * WASM 内核句柄的 TS 接口（与 crates/astro-core/src/wasm.rs 的 wasm_bindgen 导出对应）。
 * u64 在 wasm-bindgen 中映射为 bigint。
 */
export interface AstroCoreWasmBinding {
  new (): AstroCoreWasmInstance;
}

export interface AstroCoreWasmInstance {
  free(): void;
  /** 注册星历段（JSON 序列化的 BodyEphemeris）。 */
  registerEphemeris(bodyJson: string): void;
  /** 求值单天体状态（返回 BodyState）。body_id 为 u64 → bigint。 */
  evaluateState(bodyId: bigint, utcMjd: number): unknown;
  /** 求值多天体快照（返回 CelestialStateSnapshot）。body_ids 为 u64 数组 → BigUint64Array。 */
  evaluateSnapshot(bodyIds: BigUint64Array, utcMjd: number): unknown;
  /** 轨道采样，返回平铺 Float64Array [t,x,y,z, ...]。 */
  sampleOrbit(bodyId: bigint, tStartUtc: number, tEndUtc: number, baseStepDays: number): Float64Array;
  /** 时间范围下界（UTC MJD）。 */
  timeRangeMin(): number;
  /** 时间范围上界（UTC MJD）。 */
  timeRangeMax(): number;
}

/** wasm-pack 生成的模块形状。 */
interface WasmModule {
  default: (moduleOrPath?: unknown) => Promise<unknown>;
  AstroCoreWasm: AstroCoreWasmBinding;
}

/** 已加载的 WASM 模块句柄。 */
export interface LoadedAstroCoreWasm {
  AstroCoreWasm: AstroCoreWasmBinding;
}

let cachedModule: LoadedAstroCoreWasm | null = null;
let loadingPromise: Promise<LoadedAstroCoreWasm> | null = null;

/**
 * 加载 astro-core WASM 模块。
 *
 * @param moduleUrl 可选，指定 wasm 模块的基础 URL（pkg/astro_core.js 的 URL）。
 * 默认相对当前模块解析。
 */
export async function loadAstroCoreWasm(moduleUrl?: string): Promise<LoadedAstroCoreWasm> {
  if (cachedModule) return cachedModule;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const url = moduleUrl ?? new URL('../pkg/astro_core.js', import.meta.url).href;
    const mod = (await import(/* @vite-ignore */ url)) as WasmModule;
    await mod.default();
    const loaded: LoadedAstroCoreWasm = { AstroCoreWasm: mod.AstroCoreWasm };
    cachedModule = loaded;
    return loaded;
  })();

  return loadingPromise;
}

/**
 * 创建 WASM 内核实例（便捷方法）。
 */
export async function createAstroCoreWasm(moduleUrl?: string): Promise<AstroCoreWasmInstance> {
  const mod = await loadAstroCoreWasm(moduleUrl);
  return new mod.AstroCoreWasm();
}

/** 重置缓存（测试用）。 */
export function resetWasmCache(): void {
  cachedModule = null;
  loadingPromise = null;
}

export * from './time.js';
export * from './reference-frame.js';
export * from './ephemeris.js';
export * from './events.js';
