/** 右侧面板：时间控制 | 数据与科普 | 物理参数 | 轨道参数 | 真实性说明（设计文档 25.1、27）。 */
import TimeControl from './TimeControl';

export default function RightPanel() {
  return (
    <aside className="flex w-80 flex-col border-l border-space-600 bg-space-800 text-sm">
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">时间控制</h2>
        <TimeControl />
      </section>
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">数据与科普</h2>
        <div className="space-y-2 text-xs">
          <div>
            <span className="text-slate-500">名称：</span>
            <span>地球</span>
          </div>
          <div>
            <span className="text-slate-500">类型：</span>
            <span>类地行星</span>
          </div>
          <div>
            <span className="text-slate-500">资产等级：</span>
            <span className="text-accent">S 级</span>
          </div>
        </div>
      </section>
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">物理参数</h2>
        <div className="space-y-1 text-xs text-slate-400">
          <div>半径：6,371 km</div>
          <div>质量：5.972×10²⁴ kg</div>
          <div>密度：5.514 g/cm³</div>
          <div>重力：9.807 m/s²</div>
        </div>
      </section>
      <section className="border-b border-space-600 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">轨道参数</h2>
        <div className="space-y-1 text-xs text-slate-400">
          <div>公转周期：365.256 天</div>
          <div>自转周期：23.934 小时</div>
          <div>轨道半长轴：1.000 AU</div>
          <div>偏心率：0.0167</div>
        </div>
      </section>
      <section className="flex-1 overflow-y-auto p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">真实性说明</h2>
        <div className="space-y-2 text-xs text-slate-400">
          <div className="rounded border border-green-900 bg-green-950/30 px-2 py-1">
            ✓ 高精度星历（JPL DE440）
          </div>
          <div className="rounded border border-yellow-900 bg-yellow-950/30 px-2 py-1">
            ⚠ 影视增强效果（R4）
          </div>
          <p className="text-slate-500">
            数据来源：JPL Solar System Dynamics、NASA Planetary Data System
          </p>
        </div>
      </section>
    </aside>
  );
}
