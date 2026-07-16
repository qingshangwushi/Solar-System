/** 错误覆盖层（FR-BOOT-004 资源缺失/校验失败、8.2 稳定性）。 */

interface ErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorOverlay({ message, onRetry }: ErrorOverlayProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-space-900">
      <div className="w-96 max-w-[90vw] text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <h1 className="mb-2 text-lg font-semibold text-red-400">启动失败</h1>
        <p className="mb-6 break-words text-xs text-slate-500">{message}</p>
        <button
          onClick={onRetry}
          className="rounded border border-accent-dim px-4 py-2 text-sm text-accent hover:bg-space-700"
        >
          重试
        </button>
      </div>
    </div>
  );
}
