/**
 * WebGL2 上下文丢失/恢复测试（任务 T-P1-19 / R-设备丢失）。
 *
 * 验证：
 * 1. init() 注册 WEBGL_lose_context 扩展与 webglcontextlost/restored 监听；
 * 2. webglcontextlost 事件触发后 isContextLost=true、preventDefault 被调用、资源清空、onContextLost 回调触发；
 * 3. webglcontextrestored 事件触发后 isContextLost=false、setupDefaultState 调用、onContextRestored 回调触发；
 * 4. triggerContextLoss / restoreContext 通过 WEBGL_lose_context 扩展主动触发。
 */
import { describe, it, expect, vi } from 'vitest';
import { WebGl2Renderer } from '../index.js';

/** 构造 mock canvas + mock WebGL2 上下文，捕获 addEventListener 注册的回调。 */
function createMockCanvasAndGl() {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const clearColorCalls: Array<[number, number, number, number]> = [];
  const enableCalls: number[] = [];
  const depthFuncCalls: number[] = [];
  const deletedBuffers: unknown[] = [];
  const deletedTextures: unknown[] = [];
  const deletedPrograms: unknown[] = [];

  const loseExt = {
    loseContext: vi.fn(),
    restoreContext: vi.fn(),
  };

  const gl = {
    clearColor: (r: number, g: number, b: number, a: number) => {
      clearColorCalls.push([r, g, b, a]);
    },
    enable: (cap: number) => {
      enableCalls.push(cap);
    },
    depthFunc: (fn: number) => {
      depthFuncCalls.push(fn);
    },
    getExtension: vi.fn((name: string) => {
      if (name === 'WEBGL_lose_context') {
        return loseExt;
      }
      return null;
    }),
    getParameter: (_p: number) => 0,
    deleteBuffer: (b: unknown) => {
      deletedBuffers.push(b);
    },
    deleteTexture: (t: unknown) => {
      deletedTextures.push(t);
    },
    deleteProgram: (p: unknown) => {
      deletedPrograms.push(p);
    },
    DEPTH_TEST: 2929,
    LEQUAL: 515,
    MAX_TEXTURE_SIZE: 3379,
    MAX_ARRAY_TEXTURE_LAYERS: 35071,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    MAX_UNIFORM_BLOCK_SIZE: 35382,
  };

  const canvas = {
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((l) => l !== listener);
    }),
    getContext: vi.fn(() => gl),
  };

  return {
    canvas,
    gl,
    loseExt,
    listeners,
    clearColorCalls,
    enableCalls,
    depthFuncCalls,
    deletedBuffers,
    deletedTextures,
    deletedPrograms,
  };
}

/** 构造一个 Event-like 对象，仅含 preventDefault。 */
function createEvent(): { preventDefault: ReturnType<typeof vi.fn> } {
  return { preventDefault: vi.fn() };
}

describe('WebGL2 loseContext 处理', () => {
  it('init() 应注册 webglcontextlost 与 webglcontextrestored 监听', async () => {
    const { canvas } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
    );
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'webglcontextrestored',
      expect.any(Function),
    );

    renderer.destroy();
  });

  it('init() 应注册 WEBGL_lose_context 扩展', async () => {
    const { canvas, gl } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    // getExtension 应被调用过 WEBGL_lose_context
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    // triggerContextLoss 不会抛错（说明 loseExt 已设置）
    expect(() => renderer.triggerContextLoss()).not.toThrow();

    renderer.destroy();
  });

  it('初始状态 isContextLost() 为 false', async () => {
    const { canvas } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);
    expect(renderer.isContextLost()).toBe(false);
    renderer.destroy();
  });

  it('webglcontextlost 事件触发后 isContextLost=true 且 preventDefault 被调用', async () => {
    const { canvas, listeners } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    const event = createEvent();
    const lostListeners = listeners['webglcontextlost'];
    expect(lostListeners).toBeDefined();
    lostListeners![0]!(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(renderer.isContextLost()).toBe(true);

    renderer.destroy();
  });

  it('webglcontextlost 触发后应清空 buffers/textures/programs 资源', async () => {
    const { canvas, listeners } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    // 注入 mock 资源
    const buffers = (renderer as unknown as { buffers: Map<string, unknown> }).buffers;
    const textures = (renderer as unknown as { textures: Map<string, unknown> }).textures;
    const programs = (renderer as unknown as { programs: Map<string, unknown> }).programs;
    buffers.set('b1', {});
    buffers.set('b2', {});
    textures.set('t1', {});
    programs.set('p1', {});

    const event = createEvent();
    listeners['webglcontextlost']![0]!(event);

    expect(buffers.size).toBe(0);
    expect(textures.size).toBe(0);
    expect(programs.size).toBe(0);

    renderer.destroy();
  });

  it('webglcontextlost 触发 onContextLost 回调', async () => {
    const { canvas, listeners } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    const cb = vi.fn();
    renderer.onContextLost = cb;
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    const event = createEvent();
    listeners['webglcontextlost']![0]!(event);

    expect(cb).toHaveBeenCalledTimes(1);

    renderer.destroy();
  });

  it('webglcontextrestored 事件触发后 isContextLost=false', async () => {
    const { canvas, listeners } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    // 先触发丢失
    const event = createEvent();
    listeners['webglcontextlost']![0]!(event);
    expect(renderer.isContextLost()).toBe(true);

    // 再触发恢复
    listeners['webglcontextrestored']![0]!(undefined);
    expect(renderer.isContextLost()).toBe(false);

    renderer.destroy();
  });

  it('webglcontextrestored 触发 onContextRestored 回调并重新设置默认 GL 状态', async () => {
    const { canvas, listeners, clearColorCalls, enableCalls, depthFuncCalls } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    const cb = vi.fn();
    renderer.onContextRestored = cb;
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    // init 时已调用过一次 setupDefaultState
    expect(clearColorCalls.length).toBe(1);

    // 触发丢失 + 恢复
    listeners['webglcontextlost']![0]!(createEvent());
    listeners['webglcontextrestored']![0]!(undefined);

    expect(cb).toHaveBeenCalledTimes(1);
    // setupDefaultState 应再次被调用 → clearColor 调用次数 +1
    expect(clearColorCalls.length).toBe(2);
    expect(enableCalls.length).toBe(2);
    expect(depthFuncCalls.length).toBe(2);

    renderer.destroy();
  });

  it('triggerContextLoss 调用 loseExt.loseContext()', async () => {
    const { canvas, loseExt } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    renderer.triggerContextLoss();
    expect(loseExt.loseContext).toHaveBeenCalledTimes(1);

    renderer.destroy();
  });

  it('restoreContext 调用 loseExt.restoreContext()', async () => {
    const { canvas, loseExt } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    renderer.restoreContext();
    expect(loseExt.restoreContext).toHaveBeenCalledTimes(1);

    renderer.destroy();
  });

  it('未注册回调时 webglcontextlost/restored 不抛错', async () => {
    const { canvas, listeners } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    // 不设置 onContextLost / onContextRestored
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    expect(() => listeners['webglcontextlost']![0]!(createEvent())).not.toThrow();
    expect(() => listeners['webglcontextrestored']![0]!(undefined)).not.toThrow();

    renderer.destroy();
  });

  it('destroy() 移除事件监听', async () => {
    const { canvas } = createMockCanvasAndGl();
    const renderer = new WebGl2Renderer();
    await renderer.init(canvas as unknown as HTMLCanvasElement);

    renderer.destroy();

    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
    );
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      'webglcontextrestored',
      expect.any(Function),
    );
  });
});
