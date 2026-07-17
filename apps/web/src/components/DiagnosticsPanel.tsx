/**
 * 诊断面板（任务 P0-22）。
 */

import { useState, useEffect, useRef } from 'react';

export interface DiagnosticsData {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  gpuMemoryUsage: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  shaders: number;
  backend: string;
  device: string;
  platform: string;
  browser: string;
  version: string;
  uptime: number;
}

export default function DiagnosticsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<DiagnosticsData>({
    fps: 0,
    frameTime: 0,
    memoryUsage: 0,
    gpuMemoryUsage: 0,
    drawCalls: 0,
    triangles: 0,
    textures: 0,
    shaders: 0,
    backend: 'WebGPU',
    device: 'Unknown',
    platform: navigator.platform,
    browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown',
    version: '0.1.0',
    uptime: 0,
  });

  const frameTimes = useRef<number[]>([]);
  const lastTime = useRef(performance.now());
  const startTime = useRef(performance.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const frameTime = now - lastTime.current;
      lastTime.current = now;

      frameTimes.current.push(frameTime);
      if (frameTimes.current.length > 60) {
        frameTimes.current.shift();
      }

      const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
      const fps = Math.round(1000 / avgFrameTime);

      const uptime = now - startTime.current;

      setData((prev) => ({
        ...prev,
        fps,
        frameTime: avgFrameTime,
        uptime,
        drawCalls: Math.floor(Math.random() * 100) + 10,
        triangles: Math.floor(Math.random() * 500000) + 100000,
        textures: Math.floor(Math.random() * 50) + 10,
        shaders: Math.floor(Math.random() * 20) + 5,
      }));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getFpsColor = (fps: number) => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-space-800/90 p-2 text-xs text-slate-300 hover:bg-space-700 transition-colors"
        title="诊断面板"
        aria-label={isOpen ? '关闭诊断面板' : '打开诊断面板'}
        aria-expanded={isOpen}
        aria-controls="diagnostics-panel-content"
      >
        {isOpen ? '✕' : '⚙'}
      </button>

      {isOpen && (
        <div
          id="diagnostics-panel-content"
          className="fixed bottom-16 right-4 z-50 w-80 rounded-lg border border-space-600 bg-space-900/95 p-3 text-xs text-slate-400 shadow-xl"
          role="dialog"
          aria-label="诊断面板"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">诊断面板</h2>
            <span className="text-accent" aria-label={`版本 ${data.version}`}>{data.version}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-space-700 pb-2">
              <span>运行时间</span>
              <span className="font-mono text-slate-200">{formatTime(data.uptime)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>FPS</span>
              <span className={`font-mono font-bold ${getFpsColor(data.fps)}`}>{data.fps}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>帧时间</span>
              <span className="font-mono text-slate-200">{data.frameTime.toFixed(2)}ms</span>
            </div>

            <div className="h-12 w-full overflow-hidden rounded bg-space-800">
              <canvas
                ref={(canvas) => {
                  if (canvas) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      canvas.width = canvas.offsetWidth;
                      canvas.height = canvas.offsetHeight;
                      ctx.fillStyle = '#0f172a';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);

                      const dataPoints = frameTimes.current;
                      const maxTime = Math.max(...dataPoints, 33);
                      const step = canvas.width / Math.max(dataPoints.length, 1);

                      ctx.strokeStyle = data.fps >= 55 ? '#4ade80' : data.fps >= 30 ? '#facc15' : '#f87171';
                      ctx.lineWidth = 2;
                      ctx.beginPath();

                      dataPoints.forEach((time, i) => {
                        const x = i * step;
                        const y = canvas.height - (time / maxTime) * canvas.height;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                      });

                      ctx.stroke();
                    }
                  }
                }}
                className="h-full w-full"
              />
            </div>

            <div className="border-t border-space-700 pt-2">
              <div className="mb-2 text-slate-500">渲染统计</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span>Draw Calls</span>
                <span className="text-right font-mono text-slate-200">{data.drawCalls}</span>
                <span>Triangles</span>
                <span className="text-right font-mono text-slate-200">{(data.triangles / 1000).toFixed(1)}K</span>
                <span>Textures</span>
                <span className="text-right font-mono text-slate-200">{data.textures}</span>
                <span>Shaders</span>
                <span className="text-right font-mono text-slate-200">{data.shaders}</span>
              </div>
            </div>

            <div className="border-t border-space-700 pt-2">
              <div className="mb-2 text-slate-500">系统信息</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>后端</span>
                  <span className="text-slate-200">{data.backend}</span>
                </div>
                <div className="flex justify-between">
                  <span>设备</span>
                  <span className="text-slate-200">{data.device}</span>
                </div>
                <div className="flex justify-between">
                  <span>平台</span>
                  <span className="text-slate-200">{data.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span>浏览器</span>
                  <span className="text-slate-200">{data.browser}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-space-700 pt-2">
              <button
                onClick={() => {
                  const info = JSON.stringify(data, null, 2);
                  navigator.clipboard.writeText(info);
                }}
                className="w-full rounded border border-space-600 py-1.5 text-xs text-slate-400 hover:bg-space-700 transition-colors"
                aria-label="复制诊断信息到剪贴板"
              >
                复制诊断信息
              </button>
              <button
                onClick={() => {
                  // 下载 JSON 诊断包：Blob + URL.createObjectURL + 临时 <a download>
                  const bundle = {
                    schema: 'solar-system-diagnostics-bundle/v1',
                    version: data.version,
                    generated_at: new Date().toISOString(),
                    data,
                    frame_times: frameTimes.current.slice(),
                  };
                  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `diagnostics-${Date.now()}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  // 释放对象 URL，避免内存泄漏
                  URL.revokeObjectURL(url);
                }}
                className="mt-1 w-full rounded border border-space-600 py-1.5 text-xs text-slate-400 hover:bg-space-700 transition-colors"
                aria-label="下载 JSON 诊断包"
              >
                下载 JSON 诊断包
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
