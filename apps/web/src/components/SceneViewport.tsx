/**
 * Web3D 主场景视口（修复 E-35 / R-01）。
 *
 * 挂载真实 `<canvas>` 元素并在 mount 后调用 `orchestrator.attachCanvas(canvas)`，
 * 由 app-orchestrator 内部创建的 Renderer 接管绘制。移除原 ☀️ emoji 占位。
 */
import { useEffect, useRef } from 'react';
import type { AppOrchestrator } from '@solar-system/app-orchestrator';

interface SceneViewportProps {
  orchestrator: AppOrchestrator;
}

export default function SceneViewport({ orchestrator }: SceneViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 挂载画布后立即注入 orchestrator；ready 后渲染主循环即可在此 canvas 上提交
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    orchestrator.attachCanvas(canvas);
  }, [orchestrator]);

  return (
    <main
      className="relative flex-1 bg-space-900"
      role="main"
      aria-label="Web3D 太阳系主场景视口"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Web3D 渲染画布"
        role="img"
      />
    </main>
  );
}
