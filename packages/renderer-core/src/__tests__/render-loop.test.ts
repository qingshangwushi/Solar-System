/**
 * RenderLoop 帧循环测试（任务 T-P0-08 / 修复 R-01）。
 *
 * 验证：
 * 1. frame() 按正确顺序调用 camera.update → sceneGraph.traverse →
 *    (beginPass → bodyRenderer.render → endPass) × N → submit；
 * 2. registerBodyRenderer / unregisterBodyRenderer 增删渲染器；
 * 3. enabled=false 的 body renderer 被跳过；
 * 4. start/stop 控制 requestAnimationFrame 循环（注入 fake raf）；
 * 5. frameCount / elapsedTime 正确累加；
 * 6. dispose 停止循环并清空渲染器。
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  BufferDescriptor,
  BufferHandle,
  DrawCall,
  PipelineDescriptor,
  PipelineHandle,
  RenderPassDescriptor,
  Renderer,
  SceneGraph,
  SceneNode,
  TextureDescriptor,
  TextureHandle,
} from '../index.js';
import { RenderLoop, type RenderLoopBodyRenderer, type RenderLoopCamera } from '../render-loop.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockRendererCalls {
  beginPass: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  endPass: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
}

function createMockRenderer(order: string[]): { renderer: Renderer; calls: MockRendererCalls } {
  const beginPass = vi.fn((_desc: RenderPassDescriptor): void => {
    order.push('beginPass');
  });
  const draw = vi.fn((_call: DrawCall): void => {});
  const endPass = vi.fn((): void => {
    order.push('endPass');
  });
  const submit = vi.fn((): void => {
    order.push('submit');
  });

  const createBuffer = vi.fn((_desc: BufferDescriptor): BufferHandle => ({ id: 'buf-0', usage: 'static' }));
  const createTexture = vi.fn((_desc: TextureDescriptor): TextureHandle => ({ id: 'tex-0', format: 'rgba8unorm' }));
  const createPipeline = vi.fn((_desc: PipelineDescriptor): PipelineHandle => ({ id: 'pipe-0' }));

  const renderer = {
    backend: 'webgpu' as const,
    capabilities: {
      maxTextureSize: 4096,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 134217728,
      supportsFloatTextures: true,
      supportsFloat16Textures: true,
      supportsCompressedTextures: true,
    },
    init: vi.fn(async () => {}),
    destroy: vi.fn(),
    resize: vi.fn(),
    createBuffer,
    updateBuffer: vi.fn(),
    destroyBuffer: vi.fn(),
    createTexture,
    uploadTextureData: vi.fn(),
    destroyTexture: vi.fn(),
    createPipeline,
    destroyPipeline: vi.fn(),
    beginPass,
    draw,
    endPass,
    submit,
    readPixels: vi.fn(async () => new Uint8Array(0)),
  } as unknown as Renderer;

  return { renderer, calls: { beginPass, draw, endPass, submit } };
}

function createMockCamera(order: string[]): RenderLoopCamera {
  const camera: RenderLoopCamera = {
    update: vi.fn((_dt: number) => {
      order.push('camera.update');
    }),
    viewProjectionMatrix: new Float64Array(16),
    position: { x: 0, y: 0, z: 0 },
  };
  return camera;
}

function createMockSceneGraph(order: string[]): SceneGraph {
  const dummyNode = {
    updateTransform: vi.fn(() => {}),
  } as unknown as SceneNode;

  const traverse = vi.fn((callback: (node: SceneNode) => void) => {
    order.push('traverse');
    callback(dummyNode);
  });

  return {
    root: dummyNode,
    createNode: vi.fn(),
    removeNode: vi.fn(),
    traverse,
    findNode: vi.fn(),
  } as unknown as SceneGraph;
}

function createMockBodyRenderer(
  bodyId: number | string,
  order: string[],
  enabled = true,
): RenderLoopBodyRenderer {
  return {
    bodyId,
    enabled,
    render: vi.fn((_renderer: Renderer, _camera: RenderLoopCamera, _time: number) => {
      order.push(`render:${bodyId}`);
    }),
  };
}

function createLoop(order: string[]) {
  const { renderer, calls } = createMockRenderer(order);
  const camera = createMockCamera(order);
  const sceneGraph = createMockSceneGraph(order);
  const loop = new RenderLoop(renderer, sceneGraph, camera);
  return { loop, renderer, calls, camera, sceneGraph };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RenderLoop', () => {
  it('frame() with no body renderers still updates camera, traverses, and submits', () => {
    const order: string[] = [];
    const { loop, calls } = createLoop(order);

    loop.frame(16);

    expect(calls.submit).toHaveBeenCalledTimes(1);
    // No body renderers → no beginPass/endPass.
    expect(calls.beginPass).not.toHaveBeenCalled();
    expect(calls.endPass).not.toHaveBeenCalled();
    expect(order).toEqual(['camera.update', 'traverse', 'submit']);
    expect(loop.getFrameCount()).toBe(1);
  });

  it('frame() calls beginPass → render → endPass per body renderer, then submit, in order', () => {
    const order: string[] = [];
    const { loop, calls } = createLoop(order);

    const sun = createMockBodyRenderer('sun', order);
    const earth = createMockBodyRenderer('earth', order);
    loop.registerBodyRenderer('sun', sun);
    loop.registerBodyRenderer('earth', earth);

    loop.frame(16);

    // Each body renderer gets its own beginPass/endPass pair; submit once at end.
    expect(calls.beginPass).toHaveBeenCalledTimes(2);
    expect(calls.endPass).toHaveBeenCalledTimes(2);
    expect(calls.submit).toHaveBeenCalledTimes(1);

    expect(order).toEqual([
      'camera.update',
      'traverse',
      'beginPass',
      'render:sun',
      'endPass',
      'beginPass',
      'render:earth',
      'endPass',
      'submit',
    ]);
  });

  it('passes renderer, camera and elapsed time to bodyRenderer.render', () => {
    const order: string[] = [];
    const { loop, renderer, camera } = createLoop(order);

    const sun = createMockBodyRenderer('sun', order);
    loop.registerBodyRenderer('sun', sun);

    // First frame: time starts at 0.
    loop.frame(16);
    expect(sun.render).toHaveBeenCalledWith(renderer, camera, 0);

    // Second frame: time should equal accumulated deltaTime from prior frame.
    loop.frame(16);
    expect(sun.render).toHaveBeenLastCalledWith(renderer, camera, 16);
  });

  it('skips disabled body renderers', () => {
    const order: string[] = [];
    const { loop, calls } = createLoop(order);

    const sun = createMockBodyRenderer('sun', order, true);
    const earth = createMockBodyRenderer('earth', order, false);
    loop.registerBodyRenderer('sun', sun);
    loop.registerBodyRenderer('earth', earth);

    loop.frame(16);

    expect(sun.render).toHaveBeenCalledTimes(1);
    expect(earth.render).not.toHaveBeenCalled();
    // Only the enabled renderer opens a pass.
    expect(calls.beginPass).toHaveBeenCalledTimes(1);
    expect(calls.endPass).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['camera.update', 'traverse', 'beginPass', 'render:sun', 'endPass', 'submit']);
  });

  it('registerBodyRenderer / unregisterBodyRenderer add and remove renderers', () => {
    const order: string[] = [];
    const { loop, calls } = createLoop(order);

    const sun = createMockBodyRenderer('sun', order);
    loop.registerBodyRenderer('sun', sun);
    expect(loop.getBodyRendererCount()).toBe(1);
    expect(loop.getBodyRenderer('sun')).toBe(sun);

    loop.frame(16);
    expect(sun.render).toHaveBeenCalledTimes(1);

    loop.unregisterBodyRenderer('sun');
    expect(loop.getBodyRendererCount()).toBe(0);
    expect(loop.getBodyRenderer('sun')).toBeUndefined();

    calls.beginPass.mockClear();
    calls.endPass.mockClear();
    calls.submit.mockClear();
    loop.frame(16);

    expect(sun.render).toHaveBeenCalledTimes(1); // not called again
    expect(calls.beginPass).not.toHaveBeenCalled();
    expect(calls.endPass).not.toHaveBeenCalled();
    expect(calls.submit).toHaveBeenCalledTimes(1);
  });

  it('registerBodyRenderer overwrites an existing bodyId', () => {
    const order: string[] = [];
    const { loop } = createLoop(order);

    const sunV1 = createMockBodyRenderer('sun', order);
    const sunV2 = createMockBodyRenderer('sun', order);
    loop.registerBodyRenderer('sun', sunV1);
    loop.registerBodyRenderer('sun', sunV2);

    expect(loop.getBodyRendererCount()).toBe(1);
    expect(loop.getBodyRenderer('sun')).toBe(sunV2);

    loop.frame(16);
    expect(sunV1.render).not.toHaveBeenCalled();
    expect(sunV2.render).toHaveBeenCalledTimes(1);
  });

  it('tracks frameCount and elapsedTime across frames', () => {
    const { loop } = createLoop([]);

    expect(loop.getFrameCount()).toBe(0);
    expect(loop.getElapsedTime()).toBe(0);

    loop.frame(16);
    expect(loop.getFrameCount()).toBe(1);
    expect(loop.getElapsedTime()).toBe(16);

    loop.frame(16);
    expect(loop.getFrameCount()).toBe(2);
    expect(loop.getElapsedTime()).toBe(32);

    loop.frame(8);
    expect(loop.getFrameCount()).toBe(3);
    expect(loop.getElapsedTime()).toBe(40);
  });

  it('start/stop control the requestAnimationFrame loop', () => {
    const order: string[] = [];
    const { renderer, camera, sceneGraph } = (() => {
      const r = createMockRenderer([]);
      const c = createMockCamera(order);
      const s = createMockSceneGraph(order);
      return { renderer: r.renderer, camera: c, sceneGraph: s };
    })();

    const rafCallbacks: Array<(timestamp: number) => void> = [];
    let rafHandleCounter = 0;
    const cancelledHandles: number[] = [];
    const requestAnimationFrame = vi.fn((cb: (timestamp: number) => void) => {
      rafCallbacks.push(cb);
      return ++rafHandleCounter;
    });
    const cancelAnimationFrame = vi.fn((handle: number) => {
      cancelledHandles.push(handle);
    });

    const loop = new RenderLoop(renderer, sceneGraph, camera, {
      requestAnimationFrame,
      cancelAnimationFrame,
    });

    expect(loop.isRunning()).toBe(false);

    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    // Simulate the first rAF tick (deltaTime is 0 on the very first tick).
    const firstCb = rafCallbacks[0]!;
    firstCb(16);
    expect(loop.getFrameCount()).toBe(1);
    // The tick re-arms the next frame.
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    // Simulate a second tick (deltaTime = 16).
    const secondCb = rafCallbacks[1]!;
    secondCb(32);
    expect(loop.getFrameCount()).toBe(2);
    expect(loop.getElapsedTime()).toBe(16);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);

    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelledHandles).toHaveLength(1);

    // Calling a pending callback after stop should not advance the frame.
    const thirdCb = rafCallbacks[2]!;
    thirdCb(48);
    expect(loop.getFrameCount()).toBe(2);
  });

  it('start() is a no-op when already running', () => {
    const { renderer, camera, sceneGraph } = (() => {
      const r = createMockRenderer([]);
      return { renderer: r.renderer, camera: createMockCamera([]), sceneGraph: createMockSceneGraph([]) };
    })();

    const requestAnimationFrame = vi.fn((_cb: (timestamp: number) => void) => 1);
    const cancelAnimationFrame = vi.fn((_handle: number) => {});

    const loop = new RenderLoop(renderer, sceneGraph, camera, {
      requestAnimationFrame,
      cancelAnimationFrame,
    });

    loop.start();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    loop.start();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1); // not re-armed
  });

  it('stop() is a no-op when not running', () => {
    const { renderer, camera, sceneGraph } = (() => {
      const r = createMockRenderer([]);
      return { renderer: r.renderer, camera: createMockCamera([]), sceneGraph: createMockSceneGraph([]) };
    })();

    const requestAnimationFrame = vi.fn((_cb: (timestamp: number) => void) => 1);
    const cancelAnimationFrame = vi.fn((_handle: number) => {});

    const loop = new RenderLoop(renderer, sceneGraph, camera, {
      requestAnimationFrame,
      cancelAnimationFrame,
    });

    loop.stop();
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it('dispose stops the loop and clears registered renderers', () => {
    const order: string[] = [];
    const { loop } = createLoop(order);
    loop.registerBodyRenderer('sun', createMockBodyRenderer('sun', order));
    expect(loop.getBodyRendererCount()).toBe(1);

    loop.dispose();
    expect(loop.isRunning()).toBe(false);
    expect(loop.getBodyRendererCount()).toBe(0);
  });

  it('uses the provided renderPassDescriptor for each beginPass', () => {
    const { renderer, camera, sceneGraph } = (() => {
      const r = createMockRenderer([]);
      return { renderer: r.renderer, camera: createMockCamera([]), sceneGraph: createMockSceneGraph([]) };
    })();

    const desc: RenderPassDescriptor = {
      colorAttachments: [
        { texture: { id: 'color', format: 'rgba8unorm' }, clear: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
      ],
    };

    const loop = new RenderLoop(renderer, sceneGraph, camera, { renderPassDescriptor: desc });
    const sun = createMockBodyRenderer('sun', []);
    const earth = createMockBodyRenderer('earth', []);
    loop.registerBodyRenderer('sun', sun);
    loop.registerBodyRenderer('earth', earth);

    loop.frame(16);

    const beginPass = renderer.beginPass as unknown as ReturnType<typeof vi.fn>;
    expect(beginPass).toHaveBeenCalledTimes(2);
    expect(beginPass).toHaveBeenNthCalledWith(1, desc);
    expect(beginPass).toHaveBeenNthCalledWith(2, desc);
  });
});
