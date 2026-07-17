#!/usr/bin/env node

/**
 * 离线静态服务器（任务 P0-21 / 修复 E-28）。
 *
 * 重构要点：
 * - 导出 `createServer(options)` 工厂与 `isMainModule()` 守卫，import 时不自动 listen
 * - 安全头：COOP / COEP / CORP / HSTS / CSP
 * - 基于 `crypto.createHash('sha256')` 生成 ETag
 * - 预压缩 .br / .gz 文件支持
 * - Cache-Control: immutable（HTML 用 no-cache）
 * - 206 Range 支持 + If-None-Match → 304
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  /** 静态文件根目录。 */
  staticDir?: string;
  /** 监听端口，默认 8080。 */
  port?: number;
  /** 监听地址，默认 0.0.0.0。 */
  host?: string;
  /** 是否启用预压缩（.br/.gz）支持，默认 true。 */
  enablePrecompressed?: boolean;
  /** CORS 允许来源，默认 '*'。 */
  corsOrigin?: string;
}

export interface ServerHandle {
  server: http.Server;
  options: Required<ServerOptions>;
  close(): Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'font/eot',
  '.wasm': 'application/wasm',
};

const PRECOMPRESSED_PRIORITY: ReadonlyArray<{ ext: string; encoding: string }> = [
  { ext: '.br', encoding: 'br' },
  { ext: '.gz', encoding: 'gzip' },
];

/** CSP 策略：禁止远程脚本/字体/CDN，允许 wasm-unsafe-eval（WASM 模块加载）与内联样式（Tailwind 注入）。 */
const CSP_POLICY =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "media-src 'self' blob:; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

/** 判断当前模块是否作为主入口运行（被 import 时不自动 listen）。 */
export function isMainModule(): boolean {
  // import.meta.url 在直接 node 运行时等于 process.argv[1] 解析后的 URL
  if (typeof process === 'undefined' || !process.argv[1]) {
    return false;
  }
  try {
    const entry = path.resolve(process.argv[1]);
    return entry === __filename;
  } catch {
    return false;
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/** 计算文件 SHA-256 ETag（取前 32 位十六进制作为弱 ETag 值）。 */
function computeEtag(filePath: string, fileSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
    stream.on('end', () => {
      const digest = hash.digest('hex');
      // 弱 ETag：用文件大小+部分哈希区分内容变化，避免大文件完整比对开销
      resolve(`W/"${fileSize.toString(16)}-${digest.slice(0, 32)}"`);
    });
    stream.on('error', reject);
  });
}

function handleRangeRequest(
  req: http.IncomingMessage,
  fileSize: number,
): { start: number; end: number; valid: boolean } {
  const range = req.headers.range;
  if (!range) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  const start = parseInt(match[1] || '0', 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize || start > end) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  return { start, end, valid: true };
}

/** 判断文件是否为 HTML（需要 no-cache）。 */
function isHtmlFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

/** 在静态目录下尝试寻找预压缩版本，返回命中文件路径与编码。 */
function resolvePrecompressed(
  filePath: string,
  acceptEncoding: string | undefined,
): { path: string; encoding: string } | null {
  if (!acceptEncoding) return null;
  for (const candidate of PRECOMPRESSED_PRIORITY) {
    if (!acceptEncoding.includes(candidate.encoding)) continue;
    const candidatePath = `${filePath}${candidate.ext}`;
    if (fs.existsSync(candidatePath)) {
      return { path: candidatePath, encoding: candidate.encoding };
    }
  }
  return null;
}

function buildSecurityHeaders(): Record<string, string> {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Content-Security-Policy': CSP_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

function buildCommonHeaders(filePath: string, corsOrigin: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': getMimeType(filePath),
    'Access-Control-Allow-Origin': corsOrigin,
    'Accept-Ranges': 'bytes',
    'Vary': 'Accept-Encoding',
  };
  if (isHtmlFile(filePath)) {
    // HTML 入口禁止缓存以保证发布版本即时生效
    headers['Cache-Control'] = 'no-cache';
  } else {
    // 静态资源带哈希指纹，可长期 immutable 缓存
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }
  Object.assign(headers, buildSecurityHeaders());
  return headers;
}

function serveFile(
  filePath: string,
  stats: fs.Stats,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: Required<ServerOptions>,
): void {
  const acceptEncoding = req.headers['accept-encoding'];
  const precompressed = options.enablePrecompressed
    ? resolvePrecompressed(filePath, acceptEncoding)
    : null;

  const servePath = precompressed ? precompressed.path : filePath;
  const serveStats = precompressed ? fs.statSync(servePath) : stats;
  const fileSize = serveStats.size;

  // 计算 ETag（基于真实文件内容 SHA-256）
  computeEtag(servePath, fileSize)
    .then((etag) => {
      const headers = buildCommonHeaders(filePath, options.corsOrigin);
      headers['ETag'] = etag;
      if (precompressed) {
        headers['Content-Encoding'] = precompressed.encoding;
      }

      // 304 协商缓存命中
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }

      const { start, end, valid } = handleRangeRequest(req, fileSize);
      if (valid) {
        const chunkSize = end - start + 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
        headers['Content-Length'] = chunkSize.toString();
        res.writeHead(206, headers);
        const stream = fs.createReadStream(servePath, { start, end });
        stream.pipe(res);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });
      } else {
        headers['Content-Length'] = fileSize.toString();
        res.writeHead(200, headers);
        const stream = fs.createReadStream(servePath);
        stream.pipe(res);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });
      }
    })
    .catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
}

/** 创建静态服务器实例（不自动 listen，便于测试与组合）。 */
export function createServer(options: ServerOptions = {}): ServerHandle {
  const resolvedOptions: Required<ServerOptions> = {
    staticDir:
      options.staticDir ||
      process.env.STATIC_DIR ||
      path.join(__dirname, '../apps/web/dist'),
    port: options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 8080),
    host: options.host || process.env.HOST || '0.0.0.0',
    enablePrecompressed: options.enablePrecompressed ?? true,
    corsOrigin: options.corsOrigin || '*',
  };

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }
    let urlPath = req.url.split('?')[0] as string;
    if (urlPath === '/') urlPath = '/index.html';

    // 防止路径穿越
    const requestedPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(resolvedOptions.staticDir, requestedPath);

    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // SPA fallback 到 index.html
          const fallbackPath = path.join(resolvedOptions.staticDir, '/index.html');
          fs.stat(fallbackPath, (fallbackErr, fallbackStats) => {
            if (fallbackErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not Found');
              return;
            }
            serveFile(fallbackPath, fallbackStats, req, res, resolvedOptions);
          });
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
        return;
      }

      if (stats.isDirectory()) {
        const indexDir = path.join(filePath, 'index.html');
        fs.stat(indexDir, (dirErr, dirStats) => {
          if (dirErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          serveFile(indexDir, dirStats, req, res, resolvedOptions);
        });
        return;
      }

      serveFile(filePath, stats, req, res, resolvedOptions);
    });
  });

  return {
    server,
    options: resolvedOptions,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// 仅在直接运行本模块时自动 listen；被 import 时不副作用启动
if (isMainModule()) {
  const handle = createServer();
  handle.server.listen(handle.options.port, handle.options.host, () => {
    console.log(`Static server running at http://${handle.options.host}:${handle.options.port}`);
    console.log(`Serving files from: ${handle.options.staticDir}`);
    console.log('Press Ctrl+C to stop');
  });
}
