/**
 * 应用根组件（设计文档 25.1 总体布局）。
 *
 * 布局：影视主画面 + 专业侧边面板。
 * 启动时显示分阶段进度（FR-BOOT-005）；不读写持久化偏好（FR-BOOT-006）。
 */
import { useState, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar.js';
import LeftPanel from './components/LeftPanel.js';
import RightPanel from './components/RightPanel.js';
import BottomBar from './components/BottomBar.js';
import SceneViewport from './components/SceneViewport.js';
import BootProgress from './components/BootProgress.js';
import ErrorOverlay from './components/ErrorOverlay.js';

/** 启动阶段（FR-BOOT-005）。 */
const BOOT_PHASES = [
  { key: 'core', label: '核心程序', weight: 20 },
  { key: 'ephemeris', label: '星历', weight: 30 },
  { key: 'bodies', label: '基础天体', weight: 30 },
  { key: 'assets', label: '当前目标资产', weight: 20 },
] as const;

type BootPhaseKey = (typeof BOOT_PHASES)[number]['key'];
type AppState = 'booting' | 'ready' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('booting');
  const [currentPhase, setCurrentPhase] = useState<BootPhaseKey>('core');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pureMode, setPureMode] = useState(false);

  /** 模拟启动分阶段加载（实际由 diagnostics + resource-runtime 驱动）。 */
  useEffect(() => {
    if (state !== 'booting') return;
    let cancelled = false;
    const run = async () => {
      for (const phase of BOOT_PHASES) {
        if (cancelled) return;
        setCurrentPhase(phase.key);
        for (let p = 0; p <= 100; p += 10) {
          if (cancelled) return;
          setPhaseProgress(p);
          await new Promise((r) => setTimeout(r, 30));
        }
      }
      if (!cancelled) setState('ready');
    };
    run().catch((e) => {
      if (!cancelled) {
        setErrorMessage((e as Error).message);
        setState('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setPhaseProgress(0);
    setCurrentPhase('core');
    setState('booting');
  }, []);

  const overallProgress =
    BOOT_PHASES.reduce(
      (sum, ph) => sum + (ph.key === currentPhase ? (ph.weight * phaseProgress) / 100 : 0),
      0,
    );

  if (state === 'error') {
    return <ErrorOverlay message={errorMessage ?? '未知错误'} onRetry={handleRetry} />;
  }

  return (
    <div className="flex h-full w-full flex-col bg-space-900">
      {state === 'booting' && (
        <BootProgress phases={BOOT_PHASES} currentPhase={currentPhase} phaseProgress={phaseProgress} overall={overallProgress} />
      )}
      {state === 'ready' && (
        <>
          <TopBar pureMode={pureMode} onTogglePureMode={() => setPureMode((v) => !v)} />
          <div className="flex flex-1 overflow-hidden">
            {!pureMode && <LeftPanel />}
            <SceneViewport />
            {!pureMode && <RightPanel />}
          </div>
          {!pureMode && <BottomBar />}
        </>
      )}
    </div>
  );
}
