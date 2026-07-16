/** 顶栏：搜索 | 当前目标 | 产品模式 | 比例状态 | 画质 | 纯净模式（设计文档 25.1）。 */
interface TopBarProps {
  pureMode: boolean;
  onTogglePureMode: () => void;
}

export default function TopBar({ pureMode, onTogglePureMode }: TopBarProps) {
  return (
    <header className="flex h-12 items-center gap-4 border-b border-space-600 bg-space-800 px-4 text-sm">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索天体…"
          className="w-48 rounded border border-space-500 bg-space-700 px-2 py-1 text-xs outline-none placeholder:text-slate-500 focus:border-accent"
        />
      </div>
      <span className="text-slate-400">|</span>
      <span className="text-slate-300">当前目标：<span className="text-accent">太阳系全景</span></span>
      <span className="text-slate-400">|</span>
      <select className="rounded border border-space-500 bg-space-700 px-2 py-1 text-xs">
        <option value="explore">自由探索</option>
        <option value="science">科学观察</option>
        <option value="popular">科普浏览</option>
        <option value="cinematic">影视观赏</option>
        <option value="event">事件观察</option>
      </select>
      <span className="text-slate-400">|</span>
      <span className="text-xs text-slate-400">比例：增强模式</span>
      <span className="text-slate-400">|</span>
      <span className="text-xs text-slate-400">画质：自动</span>
      <div className="ml-auto">
        <button
          onClick={onTogglePureMode}
          className="rounded border border-space-500 px-3 py-1 text-xs hover:bg-space-600"
        >
          {pureMode ? '退出纯净' : '纯净模式'}
        </button>
      </div>
    </header>
  );
}
