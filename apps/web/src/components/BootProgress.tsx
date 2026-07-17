/** 启动分阶段进度（FR-BOOT-005）：核心程序/星历/基础天体/当前目标资产。 */

interface BootPhase {
  key: string;
  label: string;
  weight: number;
}

interface BootProgressProps {
  phases: readonly BootPhase[];
  currentPhase: string;
  phaseProgress: number;
  overall: number;
}

export default function BootProgress({ phases, currentPhase, phaseProgress, overall }: BootProgressProps) {
  const currentPhaseLabel = phases.find((p) => p.key === currentPhase)?.label ?? currentPhase;
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-space-900"
      role="dialog"
      aria-label="启动加载进度"
      aria-busy="true"
    >
      <div className="w-96 max-w-[90vw]">
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl" aria-hidden="true">🪐</div>
          <h1 className="text-lg font-semibold text-slate-200">太阳系真实模拟</h1>
          <p className="mt-1 text-xs text-slate-500" aria-live="polite">正在加载…</p>
        </div>
        {/* 总进度条 */}
        <div
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-space-700"
          role="progressbar"
          aria-label="总体加载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall)}
          aria-valuetext={`已完成 ${Math.round(overall)}%，当前阶段：${currentPhaseLabel} ${phaseProgress}%`}
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-150"
            style={{ width: `${overall}%` }}
          />
        </div>
        {/* 各阶段 */}
        <ul className="space-y-2" aria-label="加载阶段列表">
          {phases.map((phase) => {
            const isCurrent = phase.key === currentPhase;
            const isDone = phases.findIndex((p) => p.key === currentPhase) > phases.indexOf(phase);
            return (
              <li key={phase.key} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center" aria-hidden="true">
                  {isDone ? '✓' : isCurrent ? '◌' : '○'}
                </span>
                <span
                  className={isDone ? 'text-slate-500' : isCurrent ? 'text-accent' : 'text-slate-400'}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {phase.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-slate-500" aria-live="polite">{phaseProgress}%</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
