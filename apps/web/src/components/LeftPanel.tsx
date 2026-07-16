/** 左侧面板：天体目录 | 分类筛选 | 关系导航 | 事件入口（设计文档 25.1）。 */
export default function LeftPanel() {
  return (
    <aside className="flex w-64 flex-col border-r border-space-600 bg-space-800 text-sm">
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">天体目录</h2>
        <div className="space-y-1 text-xs">
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">☀ 太阳</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">☿ 水星</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♀ 金星</div>
          <div className="cursor-pointer rounded bg-space-600 px-2 py-1 text-accent">⊕ 地球</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♂ 火星</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♃ 木星</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♄ 土星</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♅ 天王星</div>
          <div className="cursor-pointer rounded px-2 py-1 hover:bg-space-600">♆ 海王星</div>
        </div>
      </section>
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">分类筛选</h2>
        <div className="flex flex-wrap gap-1 text-xs">
          {['恒星', '行星', '卫星', '矮行星', '小行星', '彗星'].map((t) => (
            <span key={t} className="rounded border border-space-500 px-2 py-0.5 text-slate-400">{t}</span>
          ))}
        </div>
      </section>
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">关系导航</h2>
        <p className="text-xs text-slate-500">选择天体后显示母星与卫星层级</p>
      </section>
      <section className="flex-1 overflow-y-auto p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">事件入口</h2>
        <p className="text-xs text-slate-500">日食 / 月食 / 凌日 / 合 / 冲…</p>
      </section>
    </aside>
  );
}
