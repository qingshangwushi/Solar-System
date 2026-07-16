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
  return (
    <div className="flex h-full w-full items-center justify-center bg-space-900">
      <div className="w-96 max-w-[90vw]">
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl">🪐</div>
          <h1 className="text-lg font-semibold text-slate-200">太阳系真实模拟</h1>
          <p className="mt-1 text-xs text-slate-500">正在加载…</p>
        </div>
        {/* 总进度条 */}
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-space-700">
          <div
            className="h-full rounded-full bg-accent transition-all duration-150"
            style={{ width: `${overall}%` }}
          />
        </div>
        {/* 各阶段 */}
        <div className="space-y-2">
          {phases.map((phase) => {
            const isCurrent = phase.key === currentPhase;
            const isDone = phases.findIndex((p) => p.key === currentPhase) > phases.indexOf(phase);
            return (
              <div key={phase.key} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center">
                  {isDone ? '✓' : isCurrent ? '◌' : '○'}
                </span>
                <span className={isDone ? 'text-slate-500' : isCurrent ? 'text-accent' : 'text-slate-600'}>
                  {phase.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-slate-500">{phaseProgress}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
