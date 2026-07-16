/** Web3D 主场景视口（占位，实际由 render-engine 渲染）。 */
export default function SceneViewport() {
  return (
    <main className="relative flex-1 bg-space-900">
      {/* 渲染引擎挂载点 */}
      <div id="render-canvas-host" className="absolute inset-0" />
      {/* 占位提示 */}
      <div className="absolute inset-0 flex items-center justify-center text-slate-600">
        <div className="text-center">
          <div className="mb-2 text-4xl">☀️</div>
          <p className="text-xs">Web3D 渲染引擎加载中…</p>
          <p className="mt-1 text-xs text-slate-700">WebGPU / WebGL2 双后端</p>
        </div>
      </div>
    </main>
  );
}
