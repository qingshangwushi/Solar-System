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
    <footer className="flex h-12 items-center gap-4 border-t border-space-600 bg-space-800 px-4 text-xs">
      <span className="font-mono text-slate-300">{formatTime(now)}</span>
      <span className="text-slate-400">|</span>
      <div className="flex items-center gap-1">
        <button className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600" title="减速">«</button>
        <span className="w-16 text-center text-slate-400">×1 实时</span>
        <button className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600" title="加速">»</button>
      </div>
      <span className="text-slate-400">|</span>
      <button
        onClick={() => setPaused((p) => !p)}
        className="rounded border border-space-500 px-3 py-0.5 hover:bg-space-600"
      >
        {paused ? '▶ 继续' : '⏸ 暂停'}
      </button>
      <span className="text-slate-400">|</span>
      <span className="text-slate-500">事件进度：—</span>
      <div className="ml-auto">
        <button className="rounded border border-accent-dim px-3 py-0.5 text-accent hover:bg-space-600">
          ⏵ 恢复当前时间
        </button>
      </div>
    </footer>
  );
}
