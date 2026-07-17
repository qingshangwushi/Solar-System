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
 * - HTTPS 支持：提供 --tls-cert / --tls-key 时启用 HTTPS（局域网部署所需，
 *   WebGPU 要求 Secure Context：HTTPS 或 localhost）
 *
 * 部署示例：
 *   # 本地开发（HTTP，默认 localhost；WebGPU 在 localhost 下视为 Secure Context）
 *   node packages/server/src/server.ts
 *
 *   # 局域网部署（HTTPS，自签证书由用户提供）
 *   openssl req -x509 -newkey rsa:2048 \
 *     -keyout ./key.pem -out ./cert.pem -days 365 -nodes \
 *     -subj "/CN=localhost"
 *   node packages/server/src/server.ts --tls-cert=./cert.pem --tls-key=./key.pem
 *
 *   # 通过环境变量
 *   TLS_CERT_PATH=./cert.pem TLS_KEY_PATH=./key.pem \
 *     node packages/server/src/server.ts --host=0.0.0.0 --port=8443
 *
 * 注意：
 * - 自签证书需用户自行生成并分发给客户端；首次访问需在浏览器中信任该证书。
 * - 若仅提供 --tls-cert 而未提供 --tls-key（或反之），将回退到 HTTP 并打印警告。
 * - 若证书/私钥文件读取失败，同样回退到 HTTP 并打印警告。
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

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
  /** TLS 证书文件路径（PEM）。与 tlsKeyPath 同时提供时启用 HTTPS。 */
  tlsCertPath?: string;
  /** TLS 私钥文件路径（PEM）。与 tlsCertPath 同时提供时启用 HTTPS。 */
  tlsKeyPath?: string;
  /** TLS 证书内容（PEM）。优先于 tlsCertPath，便于测试注入。 */
  tlsCert?: string | Buffer;
  /** TLS 私钥内容（PEM）。优先于 tlsKeyPath，便于测试注入。 */
  tlsKey?: string | Buffer;
}

/** 解析后的服务器选项（所有基础字段已确定取值，TLS 字段视配置可能为 undefined）。 */
export interface ResolvedServerOptions {
  staticDir: string;
  port: number;
  host: string;
  enablePrecompressed: boolean;
  corsOrigin: string;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCert?: string | Buffer;
  tlsKey?: string | Buffer;
  /** 是否已启用 HTTPS（同时具备 cert 与 key 时为 true）。 */
  tlsEnabled: boolean;
}

export interface ServerHandle {
  server: http.Server | https.Server;
  options: ResolvedServerOptions;
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
    // HSTS 在 HTTP 响应中浏览器会忽略，但保留发送以兼容现有测试与未来显式 HTTPS 场景；
    // 真正生效在 HTTPS 模式下。
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
  options: ResolvedServerOptions,
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

/**
 * 构建请求处理函数（HTTP 与 HTTPS 共享同一处理器）。
 * 提取为独立函数便于在两种 server 模式间复用，也便于单元测试。
 */
export function createRequestHandler(
  options: ResolvedServerOptions,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }
    let urlPath = req.url.split('?')[0] as string;
    if (urlPath === '/') urlPath = '/index.html';

    // 防止路径穿越
    const requestedPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(options.staticDir, requestedPath);

    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // SPA fallback 到 index.html
          const fallbackPath = path.join(options.staticDir, '/index.html');
          fs.stat(fallbackPath, (fallbackErr, fallbackStats) => {
            if (fallbackErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not Found');
              return;
            }
            serveFile(fallbackPath, fallbackStats, req, res, options);
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
          serveFile(indexDir, dirStats, req, res, options);
        });
        return;
      }

      serveFile(filePath, stats, req, res, options);
    });
  };
}

/** 读取 TLS 证书/私钥文件；失败时返回 null 并打印警告。 */
function loadTlsMaterial(
  tlsCertPath: string | undefined,
  tlsKeyPath: string | undefined,
  inlineCert?: string | Buffer,
  inlineKey?: string | Buffer,
): { cert: string | Buffer; key: string | Buffer } | null {
  // 内联内容优先（测试注入场景）
  if (inlineCert && inlineKey) {
    return { cert: inlineCert, key: inlineKey };
  }

  if (!tlsCertPath && !tlsKeyPath) return null;
  if (tlsCertPath && !tlsKeyPath) {
    console.warn(
      '[server] --tls-cert provided but --tls-key missing; falling back to HTTP.',
    );
    return null;
  }
  if (tlsKeyPath && !tlsCertPath) {
    console.warn(
      '[server] --tls-key provided but --tls-cert missing; falling back to HTTP.',
    );
    return null;
  }

  try {
    const cert = inlineCert ?? fs.readFileSync(tlsCertPath!, 'utf8');
    const key = inlineKey ?? fs.readFileSync(tlsKeyPath!, 'utf8');
    return { cert, key };
  } catch (err) {
    console.warn(
      `[server] Failed to read TLS cert/key files (${(err as NodeJS.ErrnoException).code ?? 'UNKNOWN'}); falling back to HTTP.`,
    );
    return null;
  }
}

/** 创建静态服务器实例（不自动 listen，便于测试与组合）。 */
export function createServer(options: ServerOptions = {}): ServerHandle {
  const tlsCertPath = options.tlsCertPath || process.env.TLS_CERT_PATH;
  const tlsKeyPath = options.tlsKeyPath || process.env.TLS_KEY_PATH;

  const tlsMaterial = loadTlsMaterial(
    tlsCertPath,
    tlsKeyPath,
    options.tlsCert,
    options.tlsKey,
  );
  const tlsEnabled = !!tlsMaterial;

  const resolvedOptions: ResolvedServerOptions = {
    staticDir:
      options.staticDir ||
      process.env.STATIC_DIR ||
      path.join(__dirname, '../apps/web/dist'),
    port: options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 8080),
    host: options.host || process.env.HOST || '0.0.0.0',
    enablePrecompressed: options.enablePrecompressed ?? true,
    corsOrigin: options.corsOrigin || '*',
    tlsCertPath,
    tlsKeyPath,
    tlsCert: tlsMaterial?.cert,
    tlsKey: tlsMaterial?.key,
    tlsEnabled,
  };

  const requestHandler = createRequestHandler(resolvedOptions);

  const server: http.Server | https.Server = tlsMaterial
    ? https.createServer({ cert: tlsMaterial.cert, key: tlsMaterial.key }, requestHandler)
    : http.createServer(requestHandler);

  return {
    server,
    options: resolvedOptions,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          // ERR_SERVER_NOT_RUNNING 表示服务器未 listen 或已关闭，视为成功关闭
          if (err && (err as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
            resolve();
            return;
          }
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

/** 解析命令行参数（--tls-cert / --tls-key / --port / --host / --static-dir）。 */
function parseCliArgs(): {
  tlsCert?: string;
  tlsKey?: string;
  port?: number;
  host?: string;
  staticDir?: string;
} {
  try {
    const { values } = parseArgs({
      options: {
        'tls-cert': { type: 'string' },
        'tls-key': { type: 'string' },
        'port': { type: 'string' },
        'host': { type: 'string' },
        'static-dir': { type: 'string' },
      },
      allowPositionals: false,
      strict: false,
    });
    // parseArgs 的 values 类型在 strict:false 下为 Record<string, string | boolean | undefined>，
    // 此处所有选项均声明为 type:'string'，断言为 string | undefined 以匹配返回类型。
    const tlsCert = values['tls-cert'] as string | undefined;
    const tlsKey = values['tls-key'] as string | undefined;
    const portRaw = values.port as string | undefined;
    const host = values.host as string | undefined;
    const staticDir = values['static-dir'] as string | undefined;
    return {
      tlsCert,
      tlsKey,
      port: portRaw ? parseInt(portRaw, 10) : undefined,
      host,
      staticDir,
    };
  } catch {
    // parseArgs 在遇到未知参数或类型错误时会抛出；保持向后兼容，回退到默认配置
    return {};
  }
}

// 仅在直接运行本模块时自动 listen；被 import 时不副作用启动
if (isMainModule()) {
  const cli = parseCliArgs();
  const handle = createServer({
    port: cli.port,
    host: cli.host,
    staticDir: cli.staticDir,
    tlsCertPath: cli.tlsCert,
    tlsKeyPath: cli.tlsKey,
  });

  handle.server.listen(handle.options.port, handle.options.host, () => {
    const protocol = handle.options.tlsEnabled ? 'https' : 'http';
    const mode = handle.options.tlsEnabled ? 'HTTPS (TLS enabled)' : 'HTTP (dev fallback)';
    console.log(`Static server running at ${protocol}://${handle.options.host}:${handle.options.port}`);
    console.log(`Mode: ${mode}`);
    console.log(`Serving files from: ${handle.options.staticDir}`);
    if (handle.options.tlsCertPath) {
      console.log(`TLS cert: ${handle.options.tlsCertPath}`);
    }
    if (handle.options.tlsKeyPath) {
      console.log(`TLS key: ${handle.options.tlsKeyPath}`);
    }
    if (!handle.options.tlsEnabled) {
      console.log('Tip: for LAN deployment (WebGPU secure context), use --tls-cert and --tls-key.');
    }
    console.log('Press Ctrl+C to stop');
  });
}
