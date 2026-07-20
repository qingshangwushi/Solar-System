import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// 离线静态部署：不使用任何 CDN 或在线资源（FR-OFFLINE-002）
//
// 关键修复（P0-1 部署断裂）：
// 1. 在 build 之前把 wasm-pack 产物（astro_core.js + astro_core_bg.wasm）拷贝到
//    apps/web/public/wasm/ 下，Vite 会自动把 publicDir 中的文件原样复制到 dist/。
//    AstroCoreClient 默认从 /wasm/astro_core.js 加载 WASM（DEFAULT_WASM_URL）。
// 2. astro-core-worker 由 Vite 通过 `new Worker(new URL('./astro-core-worker.ts', import.meta.url), { type: 'module' })`
//    自动打包为独立 chunk（worker.format='es'）。
// 3. 同步把 release/data/ 下的 catalog.json + ephemeris-*.bin 拷贝到 public/data/，
//    运行时 AppOrchestrator 从 /data/catalog.json 与 /data/ephemeris-<id>.bin 加载。
const __dirname = fileURLToPath(new URL('.', import.meta.url));

function copyWasmAssets() {
  const pkgDir = `${__dirname}../../packages/astro-core-wasm/pkg`;
  const targetDir = `${__dirname}public/wasm`;
  if (!existsSync(pkgDir)) {
    console.warn('[vite] astro-core-wasm/pkg not found; run `pnpm build:wasm` first');
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  for (const f of ['astro_core.js', 'astro_core_bg.wasm', 'astro_core.d.ts']) {
    const src = `${pkgDir}/${f}`;
    if (existsSync(src)) cpSync(src, `${targetDir}/${f}`);
  }
  console.log('[vite] Copied astro-core WASM assets to public/wasm/');
}

function copyDataAssets() {
  // release/data 是构建产物的权威数据源（由 tools/build-release.sh 生成）
  const srcDir = `${__dirname}../../release/data`;
  const targetDir = `${__dirname}public/data`;
  if (!existsSync(srcDir)) {
    console.warn('[vite] release/data not found; data files will 404 at runtime');
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    // 仅拷贝运行时需要的文件：catalog.json + ephemeris-*.bin + search-index.json
    if (
      entry.name === 'catalog.json' ||
      entry.name === 'search-index.json' ||
      entry.name.startsWith('ephemeris-')
    ) {
      cpSync(`${srcDir}/${entry.name}`, `${targetDir}/${entry.name}`);
      copied += 1;
    }
  }
  console.log(`[vite] Copied ${copied} data files to public/data/`);
}

export default defineConfig({
  plugins: [
    {
      name: 'solar-system-copy-static-assets',
      buildStart() {
        copyWasmAssets();
        copyDataAssets();
      },
      configureServer() {
        copyWasmAssets();
        copyDataAssets();
      },
    },
    react(),
  ],
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
    // Worker 单独打包为 ES 模块 chunk
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  // publicDir 让 Vite 把 public/wasm/* 与 public/data/* 原样复制到 dist/
  publicDir: 'public',
});

