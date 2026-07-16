/**
 * 时间控制 UI（任务 P0-19）。
 */

import { useState, useEffect, useCallback } from 'react';

export type TimeSpeed = 0.1 | 0.5 | 1 | 2 | 5 | 10 | 30 | 60 | 120 | 300 | 600 | 1800 | 3600 | 86400;

export interface TimeState {
  currentTime: Date;
  isPaused: boolean;
  speed: TimeSpeed;
  minTime: Date;
  maxTime: Date;
}

const SPEEDS: TimeSpeed[] = [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 86400];

const SPEED_LABELS: Record<TimeSpeed, string> = {
  0.1: '0.1x',
  0.5: '0.5x',
  1: '1x',
  2: '2x',
  5: '5x',
  10: '10x',
  30: '30x',
  60: '1m/s',
  120: '2m/s',
  300: '5m/s',
  600: '10m/s',
  1800: '30m/s',
  3600: '1h/s',
  86400: '1d/s',
};

export default function TimeControl() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<TimeSpeed>(1);
  const [minTime] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 100);
    return d;
  });
  const [maxTime] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 100);
    return d;
  });

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const newTime = new Date(prev.getTime() + speed * 1000);
        return newTime < minTime ? minTime : newTime > maxTime ? maxTime : newTime;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPaused, speed, minTime, maxTime]);

  const formatDateTime = useCallback((date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
  }, []);

  const formatDateShort = useCallback((date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
  }, []);

  const formatTimeShort = useCallback((date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }, []);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const newTime = new Date(minTime.getTime() + (maxTime.getTime() - minTime.getTime()) * value);
    setCurrentTime(newTime);
  }, [minTime, maxTime]);

  const handleSpeedChange = useCallback((newSpeed: TimeSpeed) => {
    setSpeed(newSpeed);
  }, []);

  const handleSkipBackward = useCallback(() => {
    const skipMs = speed * 60 * 1000;
    setCurrentTime((prev) => {
      const newTime = new Date(prev.getTime() - skipMs);
      return newTime < minTime ? minTime : newTime;
    });
  }, [speed, minTime]);

  const handleSkipForward = useCallback(() => {
    const skipMs = speed * 60 * 1000;
    setCurrentTime((prev) => {
      const newTime = new Date(prev.getTime() + skipMs);
      return newTime > maxTime ? maxTime : newTime;
    });
  }, [speed, maxTime]);

  const handleResetToNow = useCallback(() => {
    setCurrentTime(new Date());
    setSpeed(1);
    setIsPaused(false);
  }, []);

  const sliderValue = ((currentTime.getTime() - minTime.getTime()) / (maxTime.getTime() - minTime.getTime())) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">日期</span>
            <span className="font-mono text-sm text-slate-200">{formatDateShort(currentTime)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">时间</span>
            <span className="font-mono text-sm text-slate-200">{formatTimeShort(currentTime)}</span>
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-xs text-slate-400">完整时间</span>
            <span className="font-mono text-xs text-slate-300">{formatDateTime(currentTime)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSkipBackward}
            className="rounded border border-space-500 px-3 py-1.5 text-sm hover:bg-space-600 transition-colors"
            title="后退 1 分钟"
          >
            ⏪
          </button>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="rounded border border-accent-dim px-4 py-1.5 text-sm text-accent hover:bg-space-600 transition-colors"
          >
            {isPaused ? '▶ 播放' : '⏸ 暂停'}
          </button>
          <button
            onClick={handleSkipForward}
            className="rounded border border-space-500 px-3 py-1.5 text-sm hover:bg-space-600 transition-colors"
            title="前进 1 分钟"
          >
            ⏩
          </button>
          <button
            onClick={handleResetToNow}
            className="rounded border border-space-500 px-3 py-1.5 text-sm text-slate-300 hover:bg-space-600 transition-colors"
            title="恢复当前时间"
          >
            ⏵ 现在
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={handleSliderChange}
            className="w-full h-1 bg-space-600 rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>
        <span className="text-xs text-slate-500 w-16 text-right">
          {Math.round((currentTime.getTime() - minTime.getTime()) / (1000 * 60 * 60 * 24 * 365))} 年
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">速度：</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              speed === s
                ? 'bg-accent text-space-900 font-medium'
                : 'border border-space-500 text-slate-300 hover:bg-space-600'
            }`}
            title={`${s}x 实时速度`}
          >
            {SPEED_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>范围：{formatDateShort(minTime)} - {formatDateShort(maxTime)}</span>
        <span>|</span>
        <span>{isPaused ? '已暂停' : `运行中 ${SPEED_LABELS[speed]}`}</span>
      </div>
    </div>
  );
}
