/**
 * GPU 帧时基准测试器测试（E-37 修复验证）。
 *
 * 验证：
 * 1. 无 WebGL2 上下文时回落 CPU 估算（measured=false）；
 * 2. 注入 mock sampler / mock WebGL2 上下文时进入实测路径（measured=true）；
 * 3. 默认 triangleCount=100000、frameCount=60；
 * 4. inferredQuality 由 cpuMs 映射；
 * 5. runBenchmark 传入 measuredFrameTimes 时直接采用（向后兼容）。
 */
import { describe, it, expect } from 'vitest';
import {
  GpuBenchmarkRunner,
  runBenchmark,
  type CapabilityDetection,
  type GpuBenchmarkResult,
} from '../index.js';

/** 创建 mock WebGL2 上下文，记录 drawArrays / bufferData 调用。 */
function createMockWebGL2Context() {
  const drawArraysCounts: number[] = [];
  const bufferDataSizes: number[] = [];
  const gl = {
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    TRIANGLES: 4,
    createBuffer: () => ({}),
    bindBuffer: (_target: number, _buffer: unknown) => {},
    bufferData: (_target: number, data: Float32Array, _usage: number) => {
      bufferDataSizes.push(data.length);
    },
    drawArrays: (_mode: number, _first: number, count: number) => {
      drawArraysCounts.push(count);
    },
    finish: () => {},
    deleteBuffer: (_buffer: unknown) => {},
    getExtension: (_name: string) => ({ loseContext: () => {} }),
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    drawArraysCounts,
    bufferDataSizes,
  };
}

/** 创建 mock canvas，其 getContext('webgl2') 返回 mock GL。 */
function createMockCanvas(gl: WebGL2RenderingContext): HTMLCanvasElement {
  return {
    getContext: (_contextId: string) => gl,
  } as unknown as HTMLCanvasElement;
}

/** 创建最小 CapabilityDetection（无任何 GPU 支持）。 */
function createMinimalCaps(): CapabilityDetection {
  return {
    browser: 'chrome',
    browserVersion: '120',
    os: 'linux',
    osVersion: '',
    webgpu: { supported: false, adapter: null, limits: null, featureLevel: 'none' },
    webgl2: { supported: false, renderer: null, vendor: null, maxTextureSize: 0, maxTextureUnits: 0, compressedTextureFormats: [] },
    textureCompression: { etc1: false, etc2: false, astc: false, pvrtc: false, bc: false, basis: false },
    memory: { totalJsHeapSize: null, usedJsHeapSize: null },
    maxTextureSize: 0,
  };
}

describe('GpuBenchmarkRunner', () => {
  it('无 canvas 时 measured=false、gpuFrameTimeMs=null', async () => {
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run({ canvas: null });
    expect(result.measured).toBe(false);
    expect(result.gpuFrameTimeMs).toBeNull();
    expect(result.frameCount).toBe(60);
  });

  it('注入 mock sampler 时 cpuFrameTimeMs 为各帧平均', async () => {
    const cpuValues = [10, 20, 30];
    let frameIdx = 0;
    const { gl } = createMockWebGL2Context();
    const sampler = {
      beginFrame() {},
      endFrame() {
        const cpuMs = cpuValues[frameIdx % cpuValues.length]!;
        frameIdx++;
        return { cpuMs, gpuMs: null };
      },
    };
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run({
      canvas: createMockCanvas(gl),
      sampler,
      frameCount: 3,
    });
    expect(result.measured).toBe(true);
    // 平均 (10 + 20 + 30) / 3 = 20
    expect(result.cpuFrameTimeMs).toBeCloseTo(20, 5);
  });

  it('triangleCount 默认 100000', async () => {
    const { gl, bufferDataSizes } = createMockWebGL2Context();
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run({
      canvas: createMockCanvas(gl),
      frameCount: 1,
    });
    // 默认 triangleCount=100000，frameCount=1 → trianglesDrawn=100000
    expect(result.trianglesDrawn).toBe(100000);
    // 顶点缓冲数据长度 = triangleCount * 3 顶点 * 3 float
    expect(bufferDataSizes[0]).toBe(100000 * 3 * 3);
  });

  it('frameCount 默认 60', async () => {
    const { gl } = createMockWebGL2Context();
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run({
      canvas: createMockCanvas(gl),
      triangleCount: 1,
    });
    expect(result.frameCount).toBe(60);
    // triangleCount=1, frameCount=60 → trianglesDrawn=60
    expect(result.trianglesDrawn).toBe(60);
  });

  it('注入 mock WebGL2 上下文时 measured=true、trianglesDrawn = triangleCount*frameCount', async () => {
    const { gl, drawArraysCounts } = createMockWebGL2Context();
    const runner = new GpuBenchmarkRunner();
    const result = await runner.run({
      canvas: createMockCanvas(gl),
      triangleCount: 500,
      frameCount: 10,
    });
    expect(result.measured).toBe(true);
    expect(result.trianglesDrawn).toBe(500 * 10);
    expect(drawArraysCounts).toHaveLength(10);
    // 每帧 drawArrays 顶点数 = triangleCount * 3
    expect(drawArraysCounts[0]).toBe(500 * 3);
  });

  it('inferredQuality 映射（cpuMs<8.33→ultra 等）', async () => {
    const cases: Array<{ cpuMs: number; expected: GpuBenchmarkResult['inferredQuality'] }> = [
      { cpuMs: 5, expected: 'ultra' },
      { cpuMs: 8.33, expected: 'high' },
      { cpuMs: 10, expected: 'high' },
      { cpuMs: 16.67, expected: 'medium' },
      { cpuMs: 20, expected: 'medium' },
      { cpuMs: 33.33, expected: 'low' },
      { cpuMs: 40, expected: 'low' },
    ];
    for (const c of cases) {
      const { gl } = createMockWebGL2Context();
      const sampler = {
        beginFrame() {},
        endFrame: () => ({ cpuMs: c.cpuMs, gpuMs: null }),
      };
      const runner = new GpuBenchmarkRunner();
      const result = await runner.run({
        canvas: createMockCanvas(gl),
        sampler,
        frameCount: 2,
      });
      expect(result.inferredQuality).toBe(c.expected);
    }
  });
});

describe('runBenchmark (E-37 向后兼容)', () => {
  it('传入 measuredFrameTimes 时直接采用', async () => {
    const result = await runBenchmark(createMinimalCaps(), {
      measuredFrameTimes: { gpuFrameTimeMs: 12.5, cpuFrameTimeMs: 7.5 },
    });
    expect(result.gpuFrameTimeMs).toBe(12.5);
    expect(result.cpuFrameTimeMs).toBe(7.5);
  });

  it('未传 measuredFrameTimes 时使用 GpuBenchmarkRunner（Node 环境回落 CPU）', async () => {
    const result = await runBenchmark(createMinimalCaps(), {
      benchmarkOptions: { canvas: null, frameCount: 5 },
    });
    // Node 环境无 WebGL2 → measured=false → gpuFrameTimeMs 回落为 cpuFrameTimeMs
    expect(result.gpuFrameTimeMs).toBe(result.cpuFrameTimeMs);
    expect(result.notes.some((n) => n.includes('CPU 估算'))).toBe(true);
  });
});
