import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createServer, isMainModule, type ServerHandle } from '../server.js';

/**
 * 安全头与服务行为测试（修复 E-28）。
 *
 * 覆盖：COOP/COEP/CORP/HSTS/CSP/ETag/Cache-Control 头、304 协商缓存、206 Range、
 * 预压缩 .br/.gz 支持、isMainModule 守卫。
 */

function request(
  handle: ServerHandle,
  pathName: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: handle.options.host,
        port: handle.options.port,
        path: pathName,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Static Server Security Headers (E-28)', () => {
  let tmpDir: string;
  let handle: ServerHandle;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-server-'));
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!DOCTYPE html><html><body>home</body></html>',
    );
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"v":1}');
    // 预压缩版本：app.js.br / app.js.gz
    fs.writeFileSync(path.join(tmpDir, 'app.js.br'), Buffer.from('br-content'));
    fs.writeFileSync(path.join(tmpDir, 'app.js.gz'), Buffer.from('gz-content'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    handle = createServer({
      staticDir: tmpDir,
      port: 0,
      host: '127.0.0.1',
    });
    await new Promise<void>((resolve) => {
      handle.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = handle.server.address();
    if (address && typeof address === 'object') {
      // 重新写入实际监听端口供 request() 使用
      (handle.options as { port: number }).port = address.port;
    }
  });

  afterEach(async () => {
    await handle.close();
  });

  it('should expose COOP / COEP / CORP security headers', async () => {
    const res = await request(handle, '/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('should expose HSTS header with preload', async () => {
    const res = await request(handle, '/app.js');
    expect(res.status).toBe(200);
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=63072000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('should expose Content-Security-Policy header', async () => {
    const res = await request(handle, '/app.js');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('should set ETag from SHA-256 of file content', async () => {
    const res = await request(handle, '/app.js');
    expect(res.status).toBe(200);
    const etag = res.headers['etag'];
    expect(etag).toBeDefined();
    expect(typeof etag).toBe('string');
    // 弱 ETag 形如 W/"<size>-<hex>"
    expect(etag).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]{32}"$/);
  });

  it('should return 304 on matching If-None-Match', async () => {
    const first = await request(handle, '/app.js');
    const etag = first.headers['etag'];
    expect(etag).toBeDefined();
    const second = await request(handle, '/app.js', { 'If-None-Match': etag as string });
    expect(second.status).toBe(304);
  });

  it('should support 206 Partial Content via Range header', async () => {
    const res = await request(handle, '/app.js', { Range: 'bytes=0-4' });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-4/${'console.log("hello");'.length}`);
    expect(res.headers['content-length']).toBe('5');
    expect(res.body.toString()).toBe('conso');
  });

  it('should use Cache-Control: no-cache for HTML and immutable for assets', async () => {
    const html = await request(handle, '/');
    expect(html.headers['cache-control']).toBe('no-cache');
    const js = await request(handle, '/app.js');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('should serve precompressed .br when Accept-Encoding includes br', async () => {
    const res = await request(handle, '/app.js', { 'Accept-Encoding': 'br, gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.body.toString()).toBe('br-content');
  });

  it('should serve precompressed .gz when only gzip accepted', async () => {
    const res = await request(handle, '/app.js', { 'Accept-Encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.toString()).toBe('gz-content');
  });

  it('should fall back to SPA index.html on missing path', async () => {
    const res = await request(handle, '/missing-route');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body.toString()).toContain('home');
  });

  it('isMainModule() should be false under vitest (no auto-listen side-effect)', () => {
    // 在测试 runner 中 process.argv[1] 不是 server.ts
    expect(isMainModule()).toBe(false);
  });

  it('should expose Accept-Ranges and Vary headers', async () => {
    const res = await request(handle, '/app.js');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['vary']).toBe('Accept-Encoding');
  });
});
