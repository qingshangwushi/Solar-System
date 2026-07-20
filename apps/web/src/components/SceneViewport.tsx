/**
 * Web3D 主场景视口（修复 E-35 / R-01 + P0-2 输入交互）。
 *
 * 挂载真实 `<canvas>` 元素并在 mount 后调用 `orchestrator.attachCanvas(canvas)`，
 * 由 app-orchestrator 内部创建的 Renderer 接管绘制。
 *
 * P0 修复：补齐鼠标 / 滚轮 / 键盘事件处理，把交互映射到 orchestrator 的
 * rotateCamera / zoomCamera / panCamera / setNavigationMode 等公共方法
 * （设计文档 23 节导航交互）。
 */
import { useEffect, useRef } from 'react';
import type { AppOrchestrator } from '@solar-system/app-orchestrator';

interface SceneViewportProps {
  orchestrator: AppOrchestrator;
}

export default function SceneViewport({ orchestrator }: SceneViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 挂载画布 + 绑定输入事件
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    orchestrator.attachCanvas(canvas);

    // 鼠标拖拽 → 旋转相机（orbit 模式下改变 theta/phi；fly 模式下改变朝向）
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let panning = false; // Shift+拖拽 = 平移

    const onMouseDown = (e: MouseEvent) => {
      dragging = true;
      panning = e.shiftKey;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = panning ? 'grabbing' : 'move';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (panning) {
        // Shift+拖拽：平移目标点
        orchestrator.panCamera(dx, dy);
      } else {
        // 普通拖拽：旋转视角（按像素缩放到弧度）
        const theta = dx * 0.005;
        const phi = dy * 0.005;
        orchestrator.rotateCamera(theta, phi);
      }
    };

    const onMouseUp = () => {
      dragging = false;
      panning = false;
      canvas.style.cursor = 'default';
    };

    const onWheel = (e: WheelEvent) => {
      // delta>0（向上滚）= 拉近；delta<0（向下滚）= 拉远
      // 归一化到 [-0.1, 0.1] 区间，避免单次滚动跳跃过大
      const delta = Math.max(-0.1, Math.min(0.1, -e.deltaY * 0.001));
      orchestrator.zoomCamera(delta);
      e.preventDefault();
    };

    // 键盘快捷键：1=orbit, 2=fly, 3=pan；WASD 预留 fly 模式平移
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case '1':
          orchestrator.setNavigationMode('orbit');
          break;
        case '2':
          orchestrator.setNavigationMode('fly');
          break;
        case '3':
          orchestrator.setNavigationMode('pan');
          break;
      }
    };

    // 触摸事件：单指拖拽旋转，双指捏合缩放
    let touchDragging = false;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let lastTouchDist = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchDragging = true;
        lastTouchX = e.touches[0]!.clientX;
        lastTouchY = e.touches[0]!.clientY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        lastTouchDist = Math.hypot(dx, dy);
      }
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && touchDragging) {
        const dx = e.touches[0]!.clientX - lastTouchX;
        const dy = e.touches[0]!.clientY - lastTouchY;
        lastTouchX = e.touches[0]!.clientX;
        lastTouchY = e.touches[0]!.clientY;
        orchestrator.rotateCamera(dx * 0.005, dy * 0.005);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist > 0) {
          const delta = (dist - lastTouchDist) * 0.005;
          orchestrator.zoomCamera(Math.max(-0.1, Math.min(0.1, delta)));
        }
        lastTouchDist = dist;
      }
      e.preventDefault();
    };

    const onTouchEnd = () => {
      touchDragging = false;
      lastTouchDist = 0;
    };

    // 窗口尺寸变化 → 通知编排器（其内部会触发 renderer.resize + camera.updateProjection）
    const onResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
        orchestrator.attachCanvas(canvas); // 复用 attachCanvas 触发 resize 与 aspect 更新
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    window.addEventListener('resize', onResize);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
    };
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
        tabIndex={0}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-xs text-slate-300">
        鼠标拖拽=旋转 · 滚轮=缩放 · Shift+拖拽=平移 · 1/2/3=切换模式
      </div>
    </main>
  );
}
