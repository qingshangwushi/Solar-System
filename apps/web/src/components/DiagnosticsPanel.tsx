/**
 * 诊断面板（任务 P0-22 / 修复 E-35 / R-01）。
 *
 * 修复 E-24 / R-01：移除 `Math.random()` 假数据与 `setInterval` FPS 模拟，
 * 改为通过 `orchestrator.subscribeMetrics(metrics => setMetrics(metrics))`
 * 订阅真实渲染指标（fps / frameTimeMs / drawCalls / triangles / textures /
 * shaders / workerLatencyMs），首帧到达前显示 "—"。
 */
import { useState, useEffect, useRef } from 'react';
import type { AppOrchestrator, MetricsSnapshot } from '@solar-system/app-orchestrator';

interface DiagnosticsPanelProps {
  orchestrator: AppOrchestrator;
}

const APP_VERSION = '0.1.0';

const PLATFORM =
  typeof navigator !== 'undefined' ? navigator.platform : 'Unknown';
const BROWSER =
  typeof navigator !== 'undefined'
    ? navigator.userAgent.includes('Chrome')
      ? 'Chrome'
      : navigator.userAgent.includes('Firefox')
        ? 'Firefox'
        : navigator.userAgent.includes('Safari')
          ? 'Safari'
          : 'Unknown'
    : 'Unknown';

export default function DiagnosticsPanel({ orchestrator }: DiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [uptime, setUptime] = useState(0);

  // 本地维护最近 60 帧的 frameTimeMs 历史用于绘制趋势图。
  const frameTimes = useRef<number[]>([]);
  const startTime = useRef(
    typeof performance !== 'undefined' ? performance.now() : Date.now(),
  );

  useEffect(() => {
    let mounted = true;
    const unsubscribe = orchestrator.subscribeMetrics((m) => {
      if (!mounted) return;
      setMetrics(m);
      frameTimes.current.push(m.frameTimeMs);
      if (frameTimes.current.length > 60) {
        frameTimes.current.shift();
      }
    });
    // 运行时间由本地计时器驱动（每秒刷新一次显示）
    const interval = setInterval(() => {
      if (!mounted) return;
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      setUptime(now - startTime.current);
    }, 1000);
    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [orchestrator]);

  const fps = metrics?.fps ?? 0;
  const frameTime = metrics?.frameTimeMs ?? 0;
  const drawCalls = metrics?.drawCalls;
  const triangles = metrics?.triangles;
  const textures = metrics?.textures;
  const shaders = metrics?.shaders;
  const workerLatencyMs = metrics?.workerLatencyMs;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getFpsColor = (f: number) => {
    if (f >= 55) return 'text-green-400';
    if (f >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatInt = (v: number | undefined) => (v === undefined ? '—' : v);
  const formatMs = (v: number | undefined) =>
    v === undefined ? '—' : `${v.toFixed(2)}ms`;

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
            <span className="text-accent" aria-label={`版本 ${APP_VERSION}`}>{APP_VERSION}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-space-700 pb-2">
              <span>运行时间</span>
              <span className="font-mono text-slate-200">{formatTime(uptime)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>FPS</span>
              <span className={`font-mono font-bold ${getFpsColor(fps)}`}>
                {metrics ? fps : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>帧时间</span>
              <span className="font-mono text-slate-200">
                {metrics ? `${frameTime.toFixed(2)}ms` : '—'}
              </span>
            </div>

            <div className="h-12 w-full overflow-hidden rounded bg-space-800" aria-hidden="true">
              <canvas
                ref={(canvas) => {
                  if (canvas && metrics) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      canvas.width = canvas.offsetWidth;
                      canvas.height = canvas.offsetHeight;
                      ctx.fillStyle = '#0f172a';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);

                      const dataPoints = frameTimes.current;
                      const maxTime = Math.max(...dataPoints, 33);
                      const step = canvas.width / Math.max(dataPoints.length, 1);

                      ctx.strokeStyle =
                        fps >= 55 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171';
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
                <span className="text-right font-mono text-slate-200">{formatInt(drawCalls)}</span>
                <span>Triangles</span>
                <span className="text-right font-mono text-slate-200">
                  {triangles === undefined ? '—' : `${(triangles / 1000).toFixed(1)}K`}
                </span>
                <span>Textures</span>
                <span className="text-right font-mono text-slate-200">{formatInt(textures)}</span>
                <span>Shaders</span>
                <span className="text-right font-mono text-slate-200">{formatInt(shaders)}</span>
                <span>Worker 延迟</span>
                <span className="text-right font-mono text-slate-200">{formatMs(workerLatencyMs)}</span>
              </div>
            </div>

            <div className="border-t border-space-700 pt-2">
              <div className="mb-2 text-slate-500">系统信息</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>平台</span>
                  <span className="text-slate-200">{PLATFORM}</span>
                </div>
                <div className="flex justify-between">
                  <span>浏览器</span>
                  <span className="text-slate-200">{BROWSER}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-space-700 pt-2">
              <button
                onClick={() => {
                  const info = JSON.stringify(
                    {
                      version: APP_VERSION,
                      metrics,
                      uptime,
                      frame_times: frameTimes.current.slice(),
                      platform: PLATFORM,
                      browser: BROWSER,
                    },
                    null,
                    2,
                  );
                  navigator.clipboard.writeText(info);
                }}
                className="w-full rounded border border-space-600 py-1.5 text-xs text-slate-400 hover:bg-space-700 transition-colors"
                aria-label="复制诊断信息到剪贴板"
              >
                复制诊断信息
              </button>
              <button
                onClick={() => {
                  const bundle = {
                    schema: 'solar-system-diagnostics-bundle/v1',
                    version: APP_VERSION,
                    generated_at: new Date().toISOString(),
                    metrics,
                    frame_times: frameTimes.current.slice(),
                    uptime,
                    platform: PLATFORM,
                    browser: BROWSER,
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
