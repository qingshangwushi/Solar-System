import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

// 渲染后端工厂注册（P0 修复）：
// renderer-webgpu / renderer-webgl2 在模块 import 时通过 registerRendererFactory
// 把各自工厂写入 globalThis.__solarRendererFactories。AppOrchestrator.resolveRendererFactory
// 会从该注册表读取。若不在此 import，启动时 resolveRendererFactory 返回 null，编排器抛错。
import '@solar-system/renderer-webgpu';
import '@solar-system/renderer-webgl2';

// 不读写持久化偏好（FR-BOOT-006）；每次启动恢复默认状态
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
