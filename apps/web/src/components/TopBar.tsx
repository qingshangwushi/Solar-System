/**
 * 顶栏：搜索 | 当前目标 | 产品模式 | 比例状态 | 画质 | 纯净模式（设计文档 25.1）。
 *
 * P0 修复：搜索框、产品模式 select 此前是无 onChange 的死桩；现在连接到
 * NavigationService.search() 与 onSearchResultSelected 回调。
 */
import { useState, useRef, useEffect, type FC } from 'react';
import {
  createNavigationService,
  type NavigationResult,
  type NavigationService,
} from '@solar-system/navigation-service';

interface TopBarProps {
  pureMode: boolean;
  onTogglePureMode: () => void;
  /** 当前选中天体的中文名（供顶栏展示）。 */
  currentTargetName?: string;
  /** 用户选择搜索结果时触发。 */
  onSelectBody?: (bodyId: number | string) => void;
  /** 切换产品模式时触发（explore/science/popular/cinematic/event）。 */
  onChangeProductMode?: (mode: string) => void;
}

const TopBar: FC<TopBarProps> = ({
  pureMode,
  onTogglePureMode,
  currentTargetName = '太阳系全景',
  onSelectBody,
  onChangeProductMode,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NavigationResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [productMode, setProductMode] = useState('explore');
  const navServiceRef = useRef<NavigationService | null>(null);

  useEffect(() => {
    if (!navServiceRef.current) {
      try {
        navServiceRef.current = createNavigationService();
      } catch {
        /* catalog 加载失败不阻塞 UI */
      }
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (!navServiceRef.current || value.trim().length === 0) {
      setResults([]);
      setShowResults(false);
      return;
    }
    try {
      const found = navServiceRef.current.search(value.trim()).slice(0, 8);
      setResults(found);
      setShowResults(found.length > 0);
    } catch {
      setResults([]);
      setShowResults(false);
    }
  };

  const handleResultClick = (r: NavigationResult) => {
    setQuery(r.nameZh);
    setShowResults(false);
    onSelectBody?.(r.bodyId);
  };

  const handleProductModeChange = (mode: string) => {
    setProductMode(mode);
    onChangeProductMode?.(mode);
  };

  return (
    <header className="flex h-12 items-center gap-4 border-b border-space-600 bg-space-800 px-4 text-sm">
      <div className="relative flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索天体…"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          className="w-48 rounded border border-space-500 bg-space-700 px-2 py-1 text-xs outline-none placeholder:text-slate-500 focus:border-accent"
          aria-label="搜索天体"
        />
        {showResults && results.length > 0 && (
          <ul
            className="absolute left-0 top-full mt-1 z-50 w-64 rounded border border-space-500 bg-space-700 shadow-lg"
            role="listbox"
            aria-label="搜索结果"
          >
            {results.map((r) => (
              <li
                key={String(r.bodyId)}
                role="option"
                aria-selected="false"
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleResultClick(r);
                  }}
                  className="flex w-full flex-col items-start px-3 py-1.5 text-left text-xs hover:bg-space-600"
                >
                  <span className="text-slate-100">{r.nameZh} <span className="text-slate-500">({r.nameEn})</span></span>
                  <span className="text-[10px] text-slate-500">
                    {r.type} · {r.parentNameZh ?? '根'} · 匹配 {r.matchType}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="text-slate-400">|</span>
      <span className="text-slate-300">当前目标：<span className="text-accent">{currentTargetName}</span></span>
      <span className="text-slate-400">|</span>
      <select
        value={productMode}
        onChange={(e) => handleProductModeChange(e.target.value)}
        className="rounded border border-space-500 bg-space-700 px-2 py-1 text-xs"
        aria-label="产品模式"
      >
        <option value="explore">自由探索</option>
        <option value="science">科学观察</option>
        <option value="popular">科普浏览</option>
        <option value="cinematic">影视观赏</option>
        <option value="event">事件观察</option>
      </select>
      <span className="text-slate-400">|</span>
      <span className="text-xs text-slate-400">比例：真实模式</span>
      <span className="text-slate-400">|</span>
      <span className="text-xs text-slate-400">画质：自动</span>
      <div className="ml-auto">
        <button
          onClick={onTogglePureMode}
          className="rounded border border-space-500 px-3 py-1 text-xs hover:bg-space-600"
          aria-pressed={pureMode}
        >
          {pureMode ? '退出纯净' : '纯净模式'}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
