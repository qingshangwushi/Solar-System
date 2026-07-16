import { describe, it, expect } from 'vitest';
import { WebGpuRenderer, WebGpuRendererFactory, bytesPerPixel, alignTo } from '../index.js';

describe('WebGPU Renderer', () => {
  it('应创建后端类型为 webgpu 的渲染器', () => {
    const renderer = new WebGpuRenderer();
    expect(renderer.backend).toBe('webgpu');
    expect(renderer.capabilities.maxTextureSize).toBe(16384);
  });
});

describe('WebGPU Renderer Factory', () => {
  it('应在 Node 环境中报告不支持', () => {
    const factory = new WebGpuRendererFactory();
    expect(factory.isSupported()).toBe(false);
  });

  it('应能创建渲染器实例', async () => {
    const factory = new WebGpuRendererFactory();
    const renderer = await factory.create();
    expect(renderer.backend).toBe('webgpu');
  });
});

describe('bytesPerPixel', () => {
  it('应返回常见像素格式的正确字节大小', () => {
    expect(bytesPerPixel('r8unorm')).toBe(1);
    expect(bytesPerPixel('rg8unorm')).toBe(2);
    expect(bytesPerPixel('r16float')).toBe(2);
    expect(bytesPerPixel('rgba8unorm')).toBe(4);
    expect(bytesPerPixel('rgba8snorm')).toBe(4);
    expect(bytesPerPixel('bgra8unorm')).toBe(4);
    expect(bytesPerPixel('rgba16float')).toBe(8);
    expect(bytesPerPixel('rgba32float')).toBe(16);
  });

  it('未知格式应回退为 4 字节', () => {
    expect(bytesPerPixel('unknown-format')).toBe(4);
  });
});

describe('alignTo', () => {
  it('应向上对齐到 alignment 的最小倍数', () => {
    expect(alignTo(0, 256)).toBe(0);
    expect(alignTo(1, 256)).toBe(256);
    expect(alignTo(256, 256)).toBe(256);
    expect(alignTo(257, 256)).toBe(512);
    expect(alignTo(512, 256)).toBe(512);
    expect(alignTo(1000, 256)).toBe(1024);
  });

  it('bytesPerRow 应正确对齐到 256', () => {
    // 10 像素宽 rgba8unorm：10 * 4 = 40 -> 256
    const row10 = alignTo(10 * bytesPerPixel('rgba8unorm'), 256);
    expect(row10).toBe(256);
    expect(row10 % 256).toBe(0);
    expect(row10).toBeGreaterThanOrEqual(10 * 4);

    // 100 像素宽 rgba8unorm：100 * 4 = 400 -> 512
    const row100 = alignTo(100 * bytesPerPixel('rgba8unorm'), 256);
    expect(row100).toBe(512);
    expect(row100 % 256).toBe(0);

    // 64 像素宽 rgba16float：64 * 8 = 512（恰好对齐）
    const row64f16 = alignTo(64 * bytesPerPixel('rgba16float'), 256);
    expect(row64f16).toBe(512);

    // 8 像素宽 rgba32float：8 * 16 = 128 -> 256
    const row8f32 = alignTo(8 * bytesPerPixel('rgba32float'), 256);
    expect(row8f32).toBe(256);
  });
});

describe('WebGPU submit (E-01)', () => {
  it('应在 beginPass/draw/endPass 后用非空命令缓冲区数组调用 queue.submit', () => {
    const submitted: unknown[][] = [];
    const renderPass = {
      setPipeline: () => {},
      setVertexBuffer: () => {},
      setIndexBuffer: () => {},
      draw: () => {},
      drawIndexed: () => {},
      end: () => {},
    };
    const mockCommandEncoder = {
      beginRenderPass: () => renderPass,
      finish: () => ({ __finishedCommandBuffer: true }),
    };
    const mockQueue = {
      submit: (cmds: unknown[]) => {
        submitted.push(cmds);
      },
      writeBuffer: () => {},
      writeTexture: () => {},
    };
    const mockDevice = {
      queue: mockQueue,
      createCommandEncoder: () => mockCommandEncoder,
      createBuffer: () => ({}),
      createTexture: () => ({ createView: () => ({}) }),
      createRenderPipeline: () => ({}),
      createShaderModule: () => ({}),
    };

    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = mockDevice;
    (renderer as unknown as { context: unknown }).context = {
      getCurrentTexture: () => ({ createView: () => ({}) }),
    };

    const vb = renderer.createBuffer({ size: 64, usage: 'static' });
    const pipe = renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '@vertex fn main() {}' },
      fragmentShader: { stage: 'fragment', source: '@fragment fn main() {}' },
      vertexAttributes: [{ name: 'pos', format: 'float32x3', offset: 0, stride: 12 }],
      topology: 'triangles',
    });

    renderer.beginPass({
      colorAttachments: [
        { texture: { id: 'tex', format: 'rgba8unorm' }, clear: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
      ],
    });
    renderer.draw({ vertexBuffer: vb, pipeline: pipe, vertexCount: 3 });
    renderer.endPass();
    renderer.submit();

    // 首次 submit 必须提交非空命令缓冲区数组
    expect(submitted.length).toBe(1);
    const firstBatch = submitted[0]!;
    expect(firstBatch.length).toBeGreaterThan(0);
    expect(firstBatch[0]).toEqual({ __finishedCommandBuffer: true });

    // pending 列表在 submit 后应被清空：再次 submit 提交空数组
    renderer.submit();
    expect(submitted.length).toBe(2);
    expect(submitted[1]!.length).toBe(0);
  });

  it('未调用 endPass 时 submit 不应抛错且提交空数组', () => {
    const submitted: unknown[][] = [];
    const mockQueue = {
      submit: (cmds: unknown[]) => {
        submitted.push(cmds);
      },
      writeBuffer: () => {},
      writeTexture: () => {},
    };
    const mockDevice = {
      queue: mockQueue,
      createCommandEncoder: () => ({ beginRenderPass: () => ({}), finish: () => ({}) }),
      createBuffer: () => ({}),
      createTexture: () => ({ createView: () => ({}) }),
      createRenderPipeline: () => ({}),
      createShaderModule: () => ({}),
    };

    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = mockDevice;
    (renderer as unknown as { context: unknown }).context = {
      getCurrentTexture: () => ({ createView: () => ({}) }),
    };

    renderer.submit();
    expect(submitted.length).toBe(1);
    expect(submitted[0]!.length).toBe(0);
  });
});
