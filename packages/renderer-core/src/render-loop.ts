/**
 * 最小渲染主循环（任务 T-P0-08 / 修复 R-01）。
 *
 * RenderLoop 把 renderer-core 的 Renderer / SceneGraph / Camera 抽象串联成一条
 * 完整的帧渲染管线，消除审查报告中 R-01 指出的“无代码调用
 * beginPass/draw/endPass/submit 完成一帧”的架构风险。
 *
 * 每帧流程（对应审查报告给出的缓解方案：
 *   SceneGraph.traverse → body renderer.render → renderer.submit）：
 *   1. camera.update(deltaTime)              —— 更新相机姿态/矩阵
 *   2. sceneGraph.traverse(updateTransform)  —— 刷新场景节点世界矩阵
 *   3. 遍历已注册的 body renderer（enabled）：
 *        renderer.beginPass(desc)
 *        bodyRenderer.render(renderer, camera, time)
 *        renderer.endPass()
 *   4. renderer.submit()                     —— 提交本帧全部命令
 *   5. frameCount / elapsedTime 累加
 *
 * requestAnimationFrame 可通过构造选项注入，便于在 Node / 单元测试环境中驱动，
 * 也可直接调用 frame(deltaTime) 手动推进单帧。
 */

import type { Vec3d } from '@solar-system/schemas';
import type { Renderer, SceneGraph, RenderPassDescriptor } from './index.js';

export type RenderLoopBodyId = number | string;

/**
 * RenderLoop 期望的相机契约：既能按帧更新自身，又暴露渲染所需的矩阵与位置。
 *
 * 既可以是 CameraController（OrbitController / FlyController 均有 update(dt)），
 * 也可以是 CameraNode 适配器；只要结构满足即可（TypeScript 结构化类型）。
 */
export interface RenderLoopCamera {
  update(deltaTime: number): void;
  readonly viewProjectionMatrix: Float64Array;
  position: Vec3d;
}

/**
 * RenderLoop 驱动的天体渲染器契约。
 *
 * 与 body-renderers 包中自管理 pass 的 BodyRenderer 不同，这里 render() 只负责
 * 在已开启的 pass 内发出 draw 调用；pass 的开关与 submit 由 RenderLoop 统一管理，
 * 从而保证一帧内 beginPass/endPass/submit 的调用顺序恒定。
 */
export interface RenderLoopBodyRenderer {
  bodyId: RenderLoopBodyId;
  enabled: boolean;
  render(renderer: Renderer, camera: RenderLoopCamera, time: number): void;
}

export type RequestAnimationFrameLike = (callback: (timestamp: number) => void) => number;
export type CancelAnimationFrameLike = (handle: number) => void;

export interface RenderLoopOptions {
  /** 自定义 requestAnimationFrame，默认使用全局实现（Node 下回退到 setTimeout）。 */
  requestAnimationFrame?: RequestAnimationFrameLike;
  /** 自定义 cancelAnimationFrame，默认使用全局实现（Node 下回退到 clearTimeout）。 */
  cancelAnimationFrame?: CancelAnimationFrameLike;
  /** 每个 body renderer pass 的 RenderPassDescriptor；默认空 colorAttachments。 */
  renderPassDescriptor?: RenderPassDescriptor;
}

const defaultRequestAnimationFrame: RequestAnimationFrameLike = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  const ts =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return setTimeout(() => callback(ts), 16) as unknown as number;
};

const defaultCancelAnimationFrame: CancelAnimationFrameLike = (handle) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

export class RenderLoop {
  private readonly renderer: Renderer;
  private readonly sceneGraph: SceneGraph;
  private readonly camera: RenderLoopCamera;
  private readonly bodyRenderers: Map<RenderLoopBodyId, RenderLoopBodyRenderer> = new Map();
  private readonly renderPassDescriptor: RenderPassDescriptor;
  private readonly raf: RequestAnimationFrameLike;
  private readonly caf: CancelAnimationFrameLike;

  private frameCount = 0;
  private elapsedTime = 0;
  private running = false;
  private rafHandle: number | null = null;
  private lastTimestamp = 0;

  constructor(
    renderer: Renderer,
    sceneGraph: SceneGraph,
    camera: RenderLoopCamera,
    options?: RenderLoopOptions,
  ) {
    this.renderer = renderer;
    this.sceneGraph = sceneGraph;
    this.camera = camera;
    this.raf = options?.requestAnimationFrame ?? defaultRequestAnimationFrame;
    this.caf = options?.cancelAnimationFrame ?? defaultCancelAnimationFrame;
    this.renderPassDescriptor = options?.renderPassDescriptor ?? { colorAttachments: [] };
  }

  /** 启动 requestAnimationFrame 帧循环。重复调用安全（已运行时为 no-op）。 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.rafHandle = this.raf(this.tick);
  }

  /** 停止帧循环并取消已调度的回调。未运行时为 no-op。 */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafHandle !== null) {
      this.caf(this.rafHandle);
      this.rafHandle = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /** requestAnimationFrame 回调：由时间戳计算 deltaTime 后调用 frame()。 */
  private tick = (timestamp: number): void => {
    if (!this.running) return;
    const deltaTime = this.lastTimestamp === 0 ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.frame(deltaTime);
    this.rafHandle = this.raf(this.tick);
  };

  /**
   * 推进单帧。可由内部 raf 循环驱动，也可在测试中手动调用。
   *
   * 顺序：camera.update → sceneGraph.traverse →
   *      (beginPass → bodyRenderer.render → endPass) × N → submit。
   */
  frame(deltaTime: number): void {
    this.camera.update(deltaTime);

    this.sceneGraph.traverse((node) => {
      node.updateTransform();
    });

    const time = this.elapsedTime;
    for (const bodyRenderer of this.bodyRenderers.values()) {
      if (!bodyRenderer.enabled) continue;
      this.renderer.beginPass(this.renderPassDescriptor);
      bodyRenderer.render(this.renderer, this.camera, time);
      this.renderer.endPass();
    }

    this.renderer.submit();

    this.frameCount++;
    this.elapsedTime += deltaTime;
  }

  /** 注册一个 body renderer；相同 bodyId 会覆盖旧值。 */
  registerBodyRenderer(bodyId: RenderLoopBodyId, bodyRenderer: RenderLoopBodyRenderer): void {
    this.bodyRenderers.set(bodyId, bodyRenderer);
  }

  /** 注销指定 bodyId 的 body renderer。 */
  unregisterBodyRenderer(bodyId: RenderLoopBodyId): void {
    this.bodyRenderers.delete(bodyId);
  }

  getBodyRenderer(bodyId: RenderLoopBodyId): RenderLoopBodyRenderer | undefined {
    return this.bodyRenderers.get(bodyId);
  }

  getBodyRendererCount(): number {
    return this.bodyRenderers.size;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }

  /** 停止循环并清空所有已注册的 body renderer。 */
  dispose(): void {
    this.stop();
    this.bodyRenderers.clear();
  }
}
