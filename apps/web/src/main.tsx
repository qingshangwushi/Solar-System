import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

// 不读写持久化偏好（FR-BOOT-006）；每次启动恢复默认状态
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
