import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 离线静态部署：不使用任何 CDN 或在线资源（FR-OFFLINE-002）
export default defineConfig({
  plugins: [react()],
  // COOP/COEP 需求由静态服务器配置（设计文档 31.3）
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 离线包不设总容量上限，但单 chunk 体积合理
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
});
