/** 底栏：日期时间 | 倍率 | 播放暂停 | 事件进度 | 恢复当前时间（设计文档 25.1、FR-TIME）。 */
import { useState, useEffect } from 'react';

export default function BottomBar() {
  const [now, setNow] = useState(() => new Date());
  const [paused, setPaused] = useState(false);

  // 同步当前 UTC 时间（FR-TIME-001）
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const formatTime = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  };

  return (
    <footer
      className="flex h-12 items-center gap-4 border-t border-space-600 bg-space-800 px-4 text-xs"
      role="contentinfo"
      aria-label="时间控制与事件进度底栏"
    >
      <span className="font-mono text-slate-300" role="timer" aria-live="off" aria-label={`当前时间 ${formatTime(now)}`}>
        {formatTime(now)}
      </span>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <div className="flex items-center gap-1" role="group" aria-label="时间倍率控制">
        <button
          className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600"
          title="减速"
          aria-label="减速时间倍率"
        >
          «
        </button>
        <span className="w-16 text-center text-slate-400" aria-label="当前时间倍率">×1 实时</span>
        <button
          className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600"
          title="加速"
          aria-label="加速时间倍率"
        >
          »
        </button>
      </div>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <button
        onClick={() => setPaused((p) => !p)}
        className="rounded border border-space-500 px-3 py-0.5 hover:bg-space-600"
        aria-pressed={paused}
        aria-label={paused ? '继续播放时间' : '暂停时间'}
      >
        {paused ? '▶ 继续' : '⏸ 暂停'}
      </button>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <span className="text-slate-500" aria-live="polite">事件进度：—</span>
      <div className="ml-auto">
        <button
          className="rounded border border-accent-dim px-3 py-0.5 text-accent hover:bg-space-600"
          aria-label="恢复到当前真实时间"
        >
          ⏵ 恢复当前时间
        </button>
      </div>
    </footer>
  );
}
