/**
 * 底栏：日期时间 | 倍率 | 播放暂停 | 事件进度 | 恢复当前时间（设计文档 25.1、FR-TIME）。
 *
 * P0 修复：把所有控件真实连接到 AppOrchestrator 的时间控制 API。
 * 此前 all buttons 是死桩；时间显示使用 wall clock 而非 orchestrator.simulationTimeMjd。
 */
import { useState, useEffect, type FC } from 'react';
import type { AppOrchestrator } from '@solar-system/app-orchestrator';

interface BottomBarProps {
  orchestrator: AppOrchestrator;
}

/** MJD → JS Date（UTC）。MJD 起点 1858-11-17。 */
function mjdToDate(mjd: number): Date {
  // MJD 0 = 1858-11-17 00:00 UTC → 对应 Unix epoch 之前的天数
  const unixMs = (mjd - 40587) * 86400000;
  return new Date(unixMs);
}

/** JS Date → MJD。 */
function dateToMjd(d: Date): number {
  return d.getTime() / 86400000 + 40587;
}

const BottomBar: FC<BottomBarProps> = ({ orchestrator }) => {
  const [now, setNow] = useState(() => mjdToDate(orchestrator.getSimulationTime()));
  const [paused, setPaused] = useState(orchestrator.isTimePaused());
  const [rate, setRate] = useState(orchestrator.getTimeRate());

  // 拉取 orchestrator 的实时时间（每 100ms）
  useEffect(() => {
    let mounted = true;
    const update = () => {
      if (!mounted) return;
      setNow(mjdToDate(orchestrator.getSimulationTime()));
      setPaused(orchestrator.isTimePaused());
      setRate(orchestrator.getTimeRate());
    };
    update();
    const id = setInterval(update, 100);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [orchestrator]);

  const formatTime = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  };

  const handlePauseToggle = () => {
    if (paused) {
      orchestrator.resumeTime();
      setPaused(false);
    } else {
      orchestrator.pauseTime();
      setPaused(true);
    }
  };

  const handleRatePreset = (value: number) => {
    orchestrator.setTimeRate(value);
    setRate(value);
  };

  const handleResetToNow = () => {
    const realNowMjd = dateToMjd(new Date());
    orchestrator.setSimulationTime(realNowMjd);
    orchestrator.setTimeRate(1);
    orchestrator.resumeTime();
    setRate(1);
    setPaused(false);
  };

  const rateLabel = (r: number) => {
    if (r === 1) return '×1 实时';
    if (r < 1) return `×${r.toFixed(3)}`;
    if (r < 60) return `×${r.toFixed(1)}`;
    if (r < 3600) return `${(r / 60).toFixed(1)} 分/秒`;
    if (r < 86400) return `${(r / 3600).toFixed(1)} 时/秒`;
    return `${(r / 86400).toFixed(1)} 天/秒`;
  };

  return (
    <footer
      className="flex h-12 items-center gap-3 border-t border-space-600 bg-space-800 px-4 text-xs"
      role="contentinfo"
      aria-label="时间控制与事件进度底栏"
    >
      <span
        className="font-mono text-slate-300"
        role="timer"
        aria-live="off"
        aria-label={`当前模拟时间 ${formatTime(now)}`}
      >
        {formatTime(now)}
      </span>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <div className="flex items-center gap-1" role="group" aria-label="时间倍率控制">
        <button
          onClick={() => handleRatePreset(0.5)}
          className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600"
          title="减速到 0.5×"
          aria-label="减速时间倍率"
        >
          «
        </button>
        <span
          className="w-20 text-center text-slate-400"
          aria-label="当前时间倍率"
        >
          {rateLabel(rate)}
        </span>
        <button
          onClick={() => handleRatePreset(86400)}
          className="rounded border border-space-500 px-2 py-0.5 hover:bg-space-600"
          title="加速到最快"
          aria-label="加速时间倍率"
        >
          »
        </button>
      </div>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <button
        onClick={handlePauseToggle}
        className="rounded border border-space-500 px-3 py-0.5 hover:bg-space-600"
        aria-pressed={paused}
        aria-label={paused ? '继续播放时间' : '暂停时间'}
      >
        {paused ? '▶ 继续' : '⏸ 暂停'}
      </button>
      <span className="text-slate-400" aria-hidden="true">|</span>
      <span className="text-slate-500" aria-live="polite">事件进度：—</span>
      <div className="ml-auto flex items-center gap-2">
        <input
          type="datetime-local"
          step="1"
          aria-label="跳转到指定时间"
          className="rounded border border-space-500 bg-space-700 px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-accent"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            // datetime-local 给出本地时间，转 UTC MJD
            const d = new Date(v);
            if (!Number.isNaN(d.getTime())) {
              orchestrator.setSimulationTime(dateToMjd(d));
            }
          }}
        />
        <button
          onClick={handleResetToNow}
          className="rounded border border-accent-dim px-3 py-0.5 text-accent hover:bg-space-600"
          aria-label="恢复到当前真实时间"
        >
          ⏵ 恢复当前时间
        </button>
      </div>
    </footer>
  );
};

export default BottomBar;
