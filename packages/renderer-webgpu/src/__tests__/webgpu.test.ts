import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  WebGpuRenderer,
  WebGpuRendererFactory,
  bytesPerPixel,
  alignTo,
  getBufferUsage,
  getTextureUsage,
  mapPrimitiveTopology,
} from '../index.js';

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

describe('WebGPU usage 命名常量回退 (E-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('globalThis.GPUBufferUsage 存在时优先使用官方常量', () => {
    vi.stubGlobal('GPUBufferUsage', {
      MAP_READ: 800,
      MAP_WRITE: 2,
      COPY_SRC: 4,
      COPY_DST: 8,
      INDEX: 16,
      VERTEX: 32,
      STORAGE: 64,
      INDIRECT: 128,
      QUERY_RESOLVE: 256,
    });
    const usage = getBufferUsage();
    expect(usage.MAP_READ).toBe(800);
    expect(usage.COPY_SRC).toBe(4);
    expect(usage.COPY_DST).toBe(8);
  });

  it('globalThis.GPUBufferUsage 缺省时回退本地副本', () => {
    const usage = getBufferUsage();
    expect(usage.MAP_READ).toBe(1);
    expect(usage.MAP_WRITE).toBe(2);
    expect(usage.COPY_SRC).toBe(4);
    expect(usage.COPY_DST).toBe(8);
    expect(usage.QUERY_RESOLVE).toBe(256);
  });

  it('globalThis.GPUTextureUsage 存在时优先使用官方常量', () => {
    vi.stubGlobal('GPUTextureUsage', {
      COPY_SRC: 1,
      COPY_DST: 2,
      TEXTURE_BINDING: 4,
      STORAGE_BINDING: 8,
      RENDER_ATTACHMENT: 900,
    });
    const usage = getTextureUsage();
    expect(usage.RENDER_ATTACHMENT).toBe(900);
    expect(usage.COPY_DST).toBe(2);
    expect(usage.STORAGE_BINDING).toBe(8);
  });

  it('globalThis.GPUTextureUsage 缺省时回退本地副本', () => {
    const usage = getTextureUsage();
    expect(usage.COPY_SRC).toBe(1);
    expect(usage.COPY_DST).toBe(2);
    expect(usage.TEXTURE_BINDING).toBe(4);
    expect(usage.STORAGE_BINDING).toBe(8);
    expect(usage.RENDER_ATTACHMENT).toBe(16);
  });
});

describe('mapPrimitiveTopology (E-03)', () => {
  it('points → point-list', () => {
    expect(mapPrimitiveTopology('points')).toBe('point-list');
  });

  it('lines → line-list', () => {
    expect(mapPrimitiveTopology('lines')).toBe('line-list');
  });

  it('line_strip → line-strip', () => {
    expect(mapPrimitiveTopology('line_strip')).toBe('line-strip');
  });

  it('triangles → triangle-list', () => {
    expect(mapPrimitiveTopology('triangles')).toBe('triangle-list');
  });

  it('triangle_strip → triangle-strip', () => {
    expect(mapPrimitiveTopology('triangle_strip')).toBe('triangle-strip');
  });

  it('createPipeline 应使用 mapPrimitiveTopology 映射拓扑到 GPUPrimitiveTopology', () => {
    const cases: Array<{ input: 'points' | 'lines' | 'line_strip' | 'triangles' | 'triangle_strip'; expected: string }> = [
      { input: 'points', expected: 'point-list' },
      { input: 'lines', expected: 'line-list' },
      { input: 'line_strip', expected: 'line-strip' },
      { input: 'triangles', expected: 'triangle-list' },
      { input: 'triangle_strip', expected: 'triangle-strip' },
    ];

    for (const c of cases) {
      let capturedConfig: { primitive: { topology: string; cullMode: string } };
      const mockDevice = {
        createRenderPipeline: (config: unknown) => {
          capturedConfig = config as { primitive: { topology: string; cullMode: string } };
          return {};
        },
        createShaderModule: () => ({}),
      };

      const renderer = new WebGpuRenderer();
      (renderer as unknown as { device: unknown }).device = mockDevice;

      renderer.createPipeline({
        vertexShader: { stage: 'vertex', source: '' },
        fragmentShader: { stage: 'fragment', source: '' },
        vertexAttributes: [{ name: 'pos', format: 'float32x3', offset: 0, stride: 12 }],
        topology: c.input,
      });

      expect(capturedConfig!.primitive.topology).toBe(c.expected);
    }
  });

  it('createPipeline cullMode 缺省时默认 none', () => {
    let capturedConfig: { primitive: { cullMode: string } };
    const mockDevice = {
      createRenderPipeline: (config: unknown) => {
        capturedConfig = config as { primitive: { cullMode: string } };
        return {};
      },
      createShaderModule: () => ({}),
    };

    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = mockDevice;

    renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [{ name: 'pos', format: 'float32x3', offset: 0, stride: 12 }],
      topology: 'triangles',
    });

    expect(capturedConfig!.primitive.cullMode).toBe('none');
  });
});

describe('WebGPU shaderLocation (E-04)', () => {
  it('多顶点属性应分配递增 shaderLocation（不冲突）', () => {
    let capturedConfig: { vertex: { buffers: Array<{ arrayStride: number; attributes: Array<{ shaderLocation: number; offset: number; format: string }> }> } };
    const mockDevice = {
      createRenderPipeline: (config: unknown) => {
        capturedConfig = config as typeof capturedConfig;
        return {};
      },
      createShaderModule: () => ({}),
    };

    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = mockDevice;

    renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [
        { name: 'pos', format: 'float32x3', offset: 0, stride: 24 },
        { name: 'uv', format: 'float32x2', offset: 12, stride: 24 },
      ],
      topology: 'triangles',
    });

    // 每个顶点属性对应一个 buffer 入口，attributes 内仅 1 个元素，
    // 但 shaderLocation 应使用顶点属性索引（0、1），不再硬编码为 0。
    const buffers = capturedConfig!.vertex.buffers;
    expect(buffers).toHaveLength(2);

    const attr0 = buffers[0]!.attributes[0]!;
    expect(attr0.shaderLocation).toBe(0);
    expect(attr0.offset).toBe(0);
    expect(attr0.format).toBe('float32x3');

    const attr1 = buffers[1]!.attributes[0]!;
    expect(attr1.shaderLocation).toBe(1);
    expect(attr1.offset).toBe(12);
    expect(attr1.format).toBe('float32x2');
  });

  it('单顶点属性 shaderLocation 为 0', () => {
    let capturedConfig: { vertex: { buffers: Array<{ attributes: Array<{ shaderLocation: number }> }> } };
    const mockDevice = {
      createRenderPipeline: (config: unknown) => {
        capturedConfig = config as typeof capturedConfig;
        return {};
      },
      createShaderModule: () => ({}),
    };

    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = mockDevice;

    renderer.createPipeline({
      vertexShader: { stage: 'vertex', source: '' },
      fragmentShader: { stage: 'fragment', source: '' },
      vertexAttributes: [{ name: 'pos', format: 'float32x3', offset: 0, stride: 12 }],
      topology: 'triangles',
    });

    const attrs = capturedConfig!.vertex.buffers[0]!.attributes;
    expect(attrs).toHaveLength(1);
    expect(attrs[0]!.shaderLocation).toBe(0);
  });
});
