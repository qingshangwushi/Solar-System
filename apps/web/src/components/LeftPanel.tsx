/** 左侧面板：天体目录 | 分类筛选 | 关系导航 | 事件入口（设计文档 25.1）。 */
export default function LeftPanel() {
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
        <nav className="space-y-1 text-xs" aria-label="天体列表">
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：太阳"
          >
            ☀ 太阳
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：水星"
          >
            ☿ 水星
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：金星"
          >
            ♀ 金星
          </div>
          <div
            className="cursor-pointer rounded bg-space-600 px-2 py-1 text-accent"
            role="button"
            tabIndex={0}
            aria-current="true"
            aria-label="选择天体：地球（当前选中）"
          >
            ⊕ 地球
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：火星"
          >
            ♂ 火星
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：木星"
          >
            ♃ 木星
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：土星"
          >
            ♄ 土星
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：天王星"
          >
            ♅ 天王星
          </div>
          <div
            className="cursor-pointer rounded px-2 py-1 hover:bg-space-600"
            role="button"
            tabIndex={0}
            aria-label="选择天体：海王星"
          >
            ♆ 海王星
          </div>
        </nav>
      </section>
      <section className="border-b border-space-600 p-3" aria-labelledby="leftpanel-filter-heading">
        <h2 id="leftpanel-filter-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          分类筛选
        </h2>
        <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="天体类型筛选">
          {['恒星', '行星', '卫星', '矮行星', '小行星', '彗星'].map((t) => (
            <button
              key={t}
              type="button"
              className="rounded border border-space-500 px-2 py-0.5 text-slate-400 hover:bg-space-600"
              aria-pressed="false"
              aria-label={`筛选类型：${t}`}
            >
              {t}
            </button>
          ))}
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
