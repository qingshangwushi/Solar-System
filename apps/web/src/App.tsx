/**
 * 应用根组件（设计文档 25.1 总体布局）。
 *
 * 布局：影视主画面 + 专业侧边面板。
 * 启动时显示分阶段进度（FR-BOOT-005）；不读写持久化偏好（FR-BOOT-006）。
 *
 * 通过 `AppOrchestrator`（任务 T-P0-10 / 修复 E-25 / R-02）驱动真实启动流程：
 * 订阅 `BootEvent` 更新 phase/progress，ready 事件触发主界面渲染，error 事件
 * 进入重试覆盖层。修复 E-35 / R-01：移除 `setTimeout` 模拟。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppOrchestrator,
  type BootEvent,
  type BootPhase,
} from '@solar-system/app-orchestrator';
import TopBar from './components/TopBar.js';
import LeftPanel from './components/LeftPanel.js';
import RightPanel from './components/RightPanel.js';
import BottomBar from './components/BottomBar.js';
import SceneViewport from './components/SceneViewport.js';
import BootProgress from './components/BootProgress.js';
import ErrorOverlay from './components/ErrorOverlay.js';
import DiagnosticsPanel from './components/DiagnosticsPanel.js';

/** 启动阶段（FR-BOOT-005），与 orchestrator 的 BootPhase 权重保持一致。 */
const BOOT_PHASES = [
  { key: 'core', label: '核心程序', weight: 20 },
  { key: 'ephemeris', label: '星历', weight: 30 },
  { key: 'bodies', label: '基础天体', weight: 30 },
  { key: 'assets', label: '当前目标资产', weight: 20 },
] as const;

type BootPhaseKey = (typeof BOOT_PHASES)[number]['key'];
type AppState = 'booting' | 'ready' | 'error';

/** 类型守卫：BootPhase（含 'ready'）→ BootPhaseKey（不含 'ready'）。 */
function isBootPhaseKey(phase: BootPhase): phase is BootPhaseKey {
  return phase !== 'ready';
}

export default function App() {
  // 单例 orchestrator（跨渲染保持，StrictMode 双挂载也只构造一次）
  const orchestratorRef = useRef<AppOrchestrator | null>(null);
  if (orchestratorRef.current === null) {
    orchestratorRef.current = new AppOrchestrator();
  }
  const orchestrator = orchestratorRef.current;

  const [state, setState] = useState<AppState>('booting');
  const [currentPhase, setCurrentPhase] = useState<BootPhaseKey>('core');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pureMode, setPureMode] = useState(false);
  const [selectedBodyId, setSelectedBodyId] = useState<number | null>(null);

  /**
   * 订阅 orchestrator 启动事件并驱动三态 UI：
   * phase-start/progress → 更新当前阶段与进度；ready → 进入主界面；error → 进入重试。
   */
  useEffect(() => {
    let mounted = true;
    const unsubscribe = orchestrator.subscribe((event: BootEvent) => {
      if (!mounted) return;
      switch (event.type) {
        case 'phase-start':
          if (isBootPhaseKey(event.phase)) {
            setCurrentPhase(event.phase);
            setPhaseProgress(0);
          }
          break;
        case 'progress':
          if (isBootPhaseKey(event.phase)) {
            setCurrentPhase(event.phase);
            setPhaseProgress(event.phaseProgress);
          }
          break;
        case 'phase-complete':
          // 阶段完成：进度归 100，等待下一阶段 phase-start
          if (isBootPhaseKey(event.phase)) {
            setPhaseProgress(100);
          }
          break;
        case 'ready':
          setState('ready');
          break;
        case 'error':
          setErrorMessage(event.message);
          setState('error');
          break;
      }
    });
    // 启动编排（最小可见集：太阳 10 / 地球 399 / 月球 301）
    orchestrator.start({ bodyIds: [10, 399, 301] }).catch((e) => {
      if (!mounted) return;
      setErrorMessage((e as Error).message);
      setState('error');
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [orchestrator]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setPhaseProgress(0);
    setCurrentPhase('core');
    setState('booting');
    orchestrator.retry().catch((e) => {
      setErrorMessage((e as Error).message);
      setState('error');
    });
  }, [orchestrator]);

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
          <TopBar
            pureMode={pureMode}
            onTogglePureMode={() => setPureMode((v) => !v)}
            onSelectBody={(bodyId) => setSelectedBodyId(bodyId as number)}
            currentTargetName={selectedBodyId !== null ? `天体 #${selectedBodyId}` : '太阳系全景'}
          />
          <div className="flex flex-1 overflow-hidden">
            {!pureMode && (
              <LeftPanel
                selectedBodyId={selectedBodyId}
                onSelectBody={setSelectedBodyId}
              />
            )}
            <SceneViewport orchestrator={orchestrator} />
            {!pureMode && <RightPanel />}
          </div>
          {!pureMode && <BottomBar orchestrator={orchestrator} />}
          <DiagnosticsPanel orchestrator={orchestrator} />
        </>
      )}
    </div>
  );
}
