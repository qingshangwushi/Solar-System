/**
 * 左侧面板：天体目录 | 分类筛选 | 关系导航 | 事件入口（设计文档 25.1）。
 *
 * 修复 E-35 / R-01：移除硬编码 9 行星，改为通过 `NavigationService.buildHierarchy()`
 * 动态渲染天体目录树（含 parent/child 层级），点击触发 `onSelectBody(bodyId)`。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createNavigationService,
  type NavigationService,
  type HierarchyNode,
  type BodyType,
} from '@solar-system/navigation-service';

interface LeftPanelProps {
  selectedBodyId?: number | null;
  onSelectBody?: (bodyId: number) => void;
}

/** 天体类型 → 显示图标（与原占位组件的星象符号保持一致风格）。 */
const TYPE_ICON: Record<BodyType, string> = {
  star: '☀',
  planet: '⊕',
  satellite: '☾',
  'dwarf-planet': '⚳',
  asteroid: '⚹',
  comet: '☄',
};

/** 天体类型 → 中文名（用于筛选标签）。 */
const TYPE_LABEL: Record<BodyType, string> = {
  star: '恒星',
  planet: '行星',
  satellite: '卫星',
  'dwarf-planet': '矮行星',
  asteroid: '小行星',
  comet: '彗星',
};

const ALL_TYPES: BodyType[] = [
  'star',
  'planet',
  'satellite',
  'dwarf-planet',
  'asteroid',
  'comet',
];

export default function LeftPanel({ selectedBodyId, onSelectBody }: LeftPanelProps) {
  // 单例 NavigationService（catalog 内嵌于包内，构造廉价且无 IO）
  const navServiceRef = useRef<NavigationService | null>(null);
  if (navServiceRef.current === null) {
    navServiceRef.current = createNavigationService();
  }
  const navService = navServiceRef.current;

  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<BodyType | null>(null);

  // 首次挂载时拉取层级树；NavigationService 当前为同步 API，但仍走 useEffect
  // 以便后续若改为异步加载（fetch catalog.json）时无需改动调用方。
  useEffect(() => {
    let cancelled = false;
    try {
      const tree = navService.buildHierarchy();
      if (cancelled) return;
      setHierarchy(tree);
      setLoading(false);
    } catch (e) {
      if (cancelled) return;
      setError((e as Error).message ?? '加载天体目录失败');
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [navService]);

  /** 按筛选类型扁平过滤；未筛选时返回 null 表示展示完整树。 */
  const filteredEntries = useMemo(() => {
    if (!filterType) return null;
    return navService.getBodiesByType(filterType);
  }, [navService, filterType]);

  const handleSelect = (bodyId: number) => {
    onSelectBody?.(bodyId);
  };

  return (
    <aside
      className="flex w-64 flex-col border-r border-space-600 bg-space-800 text-sm"
      role="complementary"
      aria-label="天体目录与事件导航侧栏"
    >
      <section className="border-b border-space-600 p-3" aria-labelledby="leftpanel-catalog-heading">
        <h2 id="leftpanel-catalog-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          天体目录
        </h2>
        {loading && (
          <p className="text-xs text-slate-500" role="status" aria-live="polite">
            正在加载天体目录…
          </p>
        )}
        {error && (
          <p className="text-xs text-red-400" role="alert">
            加载失败：{error}
          </p>
        )}
        {!loading && !error && (
          <nav className="max-h-96 space-y-0.5 overflow-y-auto text-xs" aria-label="天体列表">
            {filteredEntries
              ? filteredEntries.length === 0
                ? <p className="text-slate-500">无匹配天体</p>
                : filteredEntries.map((entry) => {
                    const isSelected = entry.bodyId === selectedBodyId;
                    return (
                      <div
                        key={String(entry.bodyId)}
                        className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
                        style={{ paddingLeft: '1.25rem' }}
                        role="button"
                        tabIndex={0}
                        aria-current={isSelected ? 'true' : undefined}
                        aria-label={`选择天体：${entry.nameZh}`}
                        onClick={() => handleSelect(entry.bodyId as number)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelect(entry.bodyId as number);
                          }
                        }}
                      >
                        <span aria-hidden="true">{TYPE_ICON[entry.type]}</span> {entry.nameZh}
                      </div>
                    );
                  })
              : hierarchy.map((node) => (
                  <HierarchyTreeNode
                    key={String(node.body.bodyId)}
                    node={node}
                    depth={0}
                    selectedBodyId={selectedBodyId ?? null}
                    onSelect={handleSelect}
                  />
                ))}
          </nav>
        )}
      </section>
      <section className="border-b border-space-600 p-3" aria-labelledby="leftpanel-filter-heading">
        <h2 id="leftpanel-filter-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          分类筛选
        </h2>
        <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="天体类型筛选">
          {ALL_TYPES.map((t) => {
            const active = filterType === t;
            return (
              <button
                key={t}
                type="button"
                className={`rounded border px-2 py-0.5 transition-colors ${
                  active
                    ? 'border-accent-dim bg-space-600 text-accent'
                    : 'border-space-500 text-slate-400 hover:bg-space-600'
                }`}
                aria-pressed={active}
                aria-label={`筛选类型：${TYPE_LABEL[t]}`}
                onClick={() => setFilterType(active ? null : t)}
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </section>
      <section className="border-b border-space-600 p-3" aria-labelledby="leftpanel-relations-heading">
        <h2 id="leftpanel-relations-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          关系导航
        </h2>
        <p className="text-xs text-slate-500">选择天体后显示母星与卫星层级</p>
      </section>
      <section className="flex-1 overflow-y-auto p-3" aria-labelledby="leftpanel-events-heading">
        <h2 id="leftpanel-events-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          事件入口
        </h2>
        <p className="text-xs text-slate-500">日食 / 月食 / 凌日 / 合 / 冲…</p>
      </section>
    </aside>
  );
}

/** 递归渲染层级树节点。 */
function HierarchyTreeNode({
  node,
  depth,
  selectedBodyId,
  onSelect,
}: {
  node: HierarchyNode;
  depth: number;
  selectedBodyId: number | null;
  onSelect: (bodyId: number) => void;
}) {
  const body = node.body;
  const isSelected = body.bodyId === selectedBodyId;
  const indentStyle = { paddingLeft: `${8 + depth * 12}px` };
  return (
    <>
      <div
        className={`cursor-pointer rounded px-2 py-1 hover:bg-space-600 ${
          isSelected ? 'bg-space-600 text-accent' : ''
        }`}
        style={indentStyle}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? 'true' : undefined}
        aria-label={`选择天体：${body.nameZh}`}
        onClick={() => onSelect(body.bodyId as number)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(body.bodyId as number);
          }
        }}
      >
        <span aria-hidden="true">{TYPE_ICON[body.type]}</span> {body.nameZh}
      </div>
      {node.children.map((child) => (
        <HierarchyTreeNode
          key={String(child.body.bodyId)}
          node={child}
          depth={depth + 1}
          selectedBodyId={selectedBodyId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
