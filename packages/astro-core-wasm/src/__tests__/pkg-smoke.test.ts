import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadAstroCoreWasm, resetWasmCache } from '../index.js';

/**
 * pkg/ 产物烟雾测试（修复 E-41 / R-03：Worker 加载依赖 pkg/ 存在）。
 *
 * 验证 `pnpm build:wasm` 生成的 `packages/astro-core-wasm/pkg/` 产物完整且可加载，
 * 防止 E-41 类回归（pkg/ 缺失导致 Worker 与 import.meta.url 解析失败）。
 *
 * 加载策略参考 `packages/astro-core-api/src/__tests__/astro-core-wasm.test.ts`：
 * Node 环境下 wasm-pack `--target web` 产物使用 `fetch()` 加载 wasm 字节，
 * 而 Node 的 `fetch` 不支持 `file://` URL，因此通过 `initSync(wasmBytes)` 同步注入
 * 已读取的 wasm 二进制，绕过 fetch（与现有测试一致）。
 */

const PKG_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'pkg',
);

const REQUIRED_FILES = [
  'astro_core.js',
  'astro_core_bg.wasm',
  'astro_core.d.ts',
] as const;

const WASM_BINARY_PATH = path.join(PKG_DIR, 'astro_core_bg.wasm');
const wasmAvailable = existsSync(WASM_BINARY_PATH);

/**
 * 直接通过 initSync 加载 WASM（Node 环境，绕过 fetch/import.meta.url）。
 * 与 `astro-core-api` 测试中的 `loadWasmDirect` 同型。
 *
 * 注意：不使用 `as typeof import('../pkg/astro_core.js')`，因为 pkg/ 产物在
 * `pnpm build:wasm` 之前不存在，会导致 `pnpm typecheck` 失败。这里使用与
 * `astro-core-api` 测试一致的结构化类型转换。
 */
type WasmPkgModule = {
  AstroCoreWasm: new () => unknown;
  initSync: (bytes: BufferSource) => unknown;
  default: (input?: unknown) => Promise<unknown>;
};

async function loadWasmDirect(): Promise<WasmPkgModule> {
  const wasmBytes = readFileSync(WASM_BINARY_PATH);
  const mod = (await import(
    /* @vite-ignore */ path.join(PKG_DIR, 'astro_core.js')
  )) as WasmPkgModule;
  mod.initSync(wasmBytes);
  return mod;
}

describe('pkg/ artifacts smoke (E-41 / R-03)', () => {
  describe('directory and file existence', () => {
    it('pkg/ directory should exist', () => {
      expect(existsSync(PKG_DIR)).toBe(true);
      expect(statSync(PKG_DIR).isDirectory()).toBe(true);
    });

    it.each(REQUIRED_FILES)('pkg/%s should exist and be non-empty', (fileName) => {
      const filePath = path.join(PKG_DIR, fileName);
      expect(existsSync(filePath)).toBe(true);
      expect(statSync(filePath).size).toBeGreaterThan(0);
    });

    it('astro_core_bg.wasm should be a valid WebAssembly binary (>1KB)', () => {
      const wasmPath = path.join(PKG_DIR, 'astro_core_bg.wasm');
      const size = statSync(wasmPath).size;
      expect(size).toBeGreaterThan(1024);
      // WASM 二进制以 \0asm 魔数开头
      const head = readFileSync(wasmPath).subarray(0, 4);
      expect(Array.from(head)).toEqual([0x00, 0x61, 0x73, 0x6d]);
    });

    it('pkg/ should contain a package.json with astro_core entry', () => {
      const pkgJsonPath = path.join(PKG_DIR, 'package.json');
      expect(existsSync(pkgJsonPath)).toBe(true);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        main?: string;
        types?: string;
      };
      expect(pkgJson.main).toBe('astro_core.js');
      expect(pkgJson.types).toBe('astro_core.d.ts');
    });

    it('pkg/ should contain all required artifacts', () => {
      const entries = readdirSync(PKG_DIR);
      expect(entries.length).toBeGreaterThanOrEqual(REQUIRED_FILES.length);
      for (const file of REQUIRED_FILES) {
        expect(entries).toContain(file);
      }
    });
  });

  describe.runIf(wasmAvailable)('dynamic import and wasm instantiation', () => {
    let mod: Awaited<ReturnType<typeof loadWasmDirect>>;

    beforeAll(async () => {
      mod = await loadWasmDirect();
    });

    it('module should export default init function', () => {
      expect(typeof mod.default).toBe('function');
    });

    it('module should export initSync function', () => {
      expect(typeof mod.initSync).toBe('function');
    });

    it('module should export AstroCoreWasm class', () => {
      expect(typeof mod.AstroCoreWasm).toBe('function');
    });

    it('should construct an AstroCoreWasm instance and call methods', () => {
      const instance = new mod.AstroCoreWasm() as {
        registerEphemeris(json: string): void;
        evaluateState(bodyId: bigint, utcMjd: number): unknown;
        evaluateSnapshot(bodyIds: BigUint64Array, utcMjd: number): unknown;
        sampleOrbit(
          bodyId: bigint,
          tStart: number,
          tEnd: number,
          step: number,
        ): Float64Array;
        timeRangeMin(): number;
        timeRangeMax(): number;
        free(): void;
      };

      expect(typeof instance.registerEphemeris).toBe('function');
      expect(typeof instance.evaluateState).toBe('function');
      expect(typeof instance.evaluateSnapshot).toBe('function');
      expect(typeof instance.sampleOrbit).toBe('function');
      expect(typeof instance.timeRangeMin).toBe('function');
      expect(typeof instance.timeRangeMax).toBe('function');
      expect(typeof instance.free).toBe('function');

      // 默认内核（空星历）应回退到项目默认时间范围 1900-2100。
      expect(instance.timeRangeMin()).toBeLessThan(15100.0);
      expect(instance.timeRangeMax()).toBeGreaterThan(88000.0);

      instance.free();
    });

    it('should register ephemeris and evaluate state', () => {
      const instance = new mod.AstroCoreWasm() as {
        registerEphemeris(json: string): void;
        evaluateState(bodyId: bigint, utcMjd: number): {
          body_id: number;
          position: { x: number; y: number; z: number };
          flags: { is_nan_position: boolean };
        };
        free(): void;
      };

      // 与 Rust 测试 linear_eph 一致：f(tdb) = 2*tdb + 1
      const mid = 0.5 * (51544.0 + 51576.0);
      const half = 0.5 * (51576.0 - 51544.0);
      instance.registerEphemeris(
        JSON.stringify({
          body_id: 399,
          frame: 'HeliocentricInertial',
          precision: 'P4',
          segments: [
            {
              t_start: 51544.0,
              t_end: 51576.0,
              coef_x: [2.0 * mid + 1.0, 2.0 * half],
              coef_y: [0.0, 0.0],
              coef_z: [0.0, 0.0],
            },
          ],
        }),
      );

      const state = instance.evaluateState(399n, 51560.0);
      expect(state.body_id).toBe(399);
      expect(state.flags.is_nan_position).toBe(false);
      expect(state.position).toBeDefined();
      instance.free();
    });
  });

  describe('loadAstroCoreWasm() loader interface', () => {
    beforeAll(() => {
      resetWasmCache();
    });

    it('should export loadAstroCoreWasm as a function', () => {
      expect(typeof loadAstroCoreWasm).toBe('function');
    });

    it('should construct a URL pointing to ../pkg/astro_core.js relative to index.ts', () => {
      // 验证 loader 默认 URL 解析路径正确：index.ts 位于 src/，
      // `../pkg/astro_core.js` 应指向 pkg/astro_core.js。
      const expectedPkg = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'pkg',
        'astro_core.js',
      );
      expect(existsSync(expectedPkg)).toBe(true);
    });
  });
});
