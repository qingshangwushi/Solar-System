/**
 * WebGPU 设备丢失重建测试（任务 T-P1-19 / R-设备丢失）。
 *
 * 验证：
 * 1. handleDeviceLost 标记 deviceLost + rebuildRequired、销毁资源、触发回调；
 * 2. isDeviceLost/isRebuildRequired/clearRebuildFlag 公共 API 行为正确；
 * 3. init() 注册 device.lost 监听，丢失事件触发后状态正确；
 * 4. reinit() 重新获取 device 并清除重建标志。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebGpuRenderer, type DeviceLostInfo } from '../index.js';

describe('WebGPU 设备丢失重建', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始状态 isDeviceLost()/isRebuildRequired() 均为 false', () => {
    const renderer = new WebGpuRenderer();
    expect(renderer.isDeviceLost()).toBe(false);
    expect(renderer.isRebuildRequired()).toBe(false);
  });

  it('handleDeviceLost 标记 deviceLost=true', () => {
    const renderer = new WebGpuRenderer();
    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });
    expect(renderer.isDeviceLost()).toBe(true);
  });

  it('handleDeviceLost 标记 rebuildRequired=true', () => {
    const renderer = new WebGpuRenderer();
    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });
    expect(renderer.isRebuildRequired()).toBe(true);
  });

  it('handleDeviceLost 销毁所有 GPU 资源（buffers/textures/pipelines）', () => {
    const renderer = new WebGpuRenderer();
    const destroyedBuffers: string[] = [];
    const destroyedTextures: string[] = [];
    const destroyedPipelines: string[] = [];

    (renderer as unknown as { device: unknown }).device = { destroy: () => {} };
    const buffers = (renderer as unknown as { buffers: Map<string, unknown> }).buffers;
    const textures = (renderer as unknown as { textures: Map<string, unknown> }).textures;
    const pipelines = (renderer as unknown as { pipelines: Map<string, unknown> }).pipelines;

    buffers.set('b1', { destroy: () => destroyedBuffers.push('b1') });
    buffers.set('b2', { destroy: () => destroyedBuffers.push('b2') });
    textures.set('t1', { destroy: () => destroyedTextures.push('t1') });
    pipelines.set('p1', { destroy: () => destroyedPipelines.push('p1') });

    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });

    expect(destroyedBuffers).toEqual(['b1', 'b2']);
    expect(destroyedTextures).toEqual(['t1']);
    expect(destroyedPipelines).toEqual(['p1']);
    expect(buffers.size).toBe(0);
    expect(textures.size).toBe(0);
    expect(pipelines.size).toBe(0);
  });

  it('handleDeviceLost 将 device 字段置为 null', () => {
    const renderer = new WebGpuRenderer();
    (renderer as unknown as { device: unknown }).device = { destroy: () => {} };
    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });
    expect((renderer as unknown as { device: unknown }).device).toBeNull();
  });

  it('handleDeviceLost 触发 onDeviceLost 回调（携带 info）', () => {
    const renderer = new WebGpuRenderer();
    const cb = vi.fn();
    renderer.onDeviceLost = cb;
    const info: DeviceLostInfo = { reason: 'destroyed', message: 'device lost' };
    renderer.handleDeviceLost(info);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(info);
  });

  it('未注册 onDeviceLost 时 handleDeviceLost 不抛错', () => {
    const renderer = new WebGpuRenderer();
    expect(() =>
      renderer.handleDeviceLost({ reason: 'destroyed', message: 'no callback' }),
    ).not.toThrow();
    expect(renderer.isDeviceLost()).toBe(true);
  });

  it('clearRebuildFlag 清除 rebuildRequired 但保留 deviceLost', () => {
    const renderer = new WebGpuRenderer();
    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });
    expect(renderer.isRebuildRequired()).toBe(true);

    renderer.clearRebuildFlag();
    expect(renderer.isRebuildRequired()).toBe(false);
    // deviceLost 不应被 clearRebuildFlag 清除
    expect(renderer.isDeviceLost()).toBe(true);
  });

  it('init() 注册 device.lost 监听；丢失事件触发后状态变更并调用回调', async () => {
    let lostResolve: (info: DeviceLostInfo) => void = () => {};
    const lostPromise = new Promise<DeviceLostInfo>((resolve) => {
      lostResolve = resolve;
    });

    const mockDevice = {
      lost: lostPromise,
      destroy: () => {},
    };
    const mockAdapter = {
      requestDevice: () => Promise.resolve(mockDevice),
      limits: { maxTextureDimension2D: 16384 },
    };
    const mockGpu = {
      requestAdapter: () => Promise.resolve(mockAdapter),
      getPreferredCanvasFormat: () => 'rgba8unorm',
    };
    const mockContext = { configure: vi.fn() };
    const mockCanvas = {
      getContext: () => mockContext,
    };

    // 注入 navigator.gpu（保证 'gpu' in navigator 为 true）
    vi.stubGlobal('navigator', { gpu: mockGpu });

    const renderer = new WebGpuRenderer();
    const cb = vi.fn();
    renderer.onDeviceLost = cb;

    await renderer.init(mockCanvas as unknown as HTMLCanvasElement);
    expect(renderer.isDeviceLost()).toBe(false);
    expect(mockContext.configure).toHaveBeenCalledTimes(1);

    // 触发设备丢失
    lostResolve({ reason: 'destroyed', message: 'device lost in test' });
    // 等待 .then 微任务执行
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.isDeviceLost()).toBe(true);
    expect(renderer.isRebuildRequired()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ reason: 'destroyed', message: 'device lost in test' });
  });

  it('reinit() 重新获取 device 并清除 deviceLost/rebuildRequired', async () => {
    // 使用永不 resolve 的 lost promise，避免 reinit 后异步触发 handleDeviceLost
    const pendingLost = new Promise<DeviceLostInfo>(() => {});
    const mockDevice2 = {
      lost: pendingLost,
      destroy: () => {},
    };
    const mockAdapter2 = {
      requestDevice: () => Promise.resolve(mockDevice2),
      limits: { maxTextureDimension2D: 16384 },
    };
    const mockGpu = {
      requestAdapter: () => Promise.resolve(mockAdapter2),
      getPreferredCanvasFormat: () => 'rgba8unorm',
    };
    const mockContext = { configure: vi.fn() };
    const mockCanvas = {
      getContext: () => mockContext,
    };

    const renderer = new WebGpuRenderer();
    // 模拟已 init 状态：注入 gpu/canvas/context 字段
    (renderer as unknown as { gpu: unknown }).gpu = mockGpu;
    (renderer as unknown as { canvas: unknown }).canvas = mockCanvas;
    (renderer as unknown as { context: unknown }).context = mockContext;

    // 模拟设备丢失
    renderer.handleDeviceLost({ reason: 'destroyed', message: 'test' });
    expect(renderer.isDeviceLost()).toBe(true);
    expect(renderer.isRebuildRequired()).toBe(true);

    await renderer.reinit();

    expect(renderer.isDeviceLost()).toBe(false);
    expect(renderer.isRebuildRequired()).toBe(false);
    expect((renderer as unknown as { device: unknown }).device).toBe(mockDevice2);
    // 重新配置 context（用新 device）
    expect(mockContext.configure).toHaveBeenCalledTimes(1);
  });

  it('reinit() 在未 init 时抛错', async () => {
    const renderer = new WebGpuRenderer();
    await expect(renderer.reinit()).rejects.toThrow('Renderer not initialized');
  });
});
