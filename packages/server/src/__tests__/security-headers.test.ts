import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { createServer, isMainModule, type ServerHandle } from '../server.js';

/**
 * 安全头与服务行为测试（修复 E-28）。
 *
 * 覆盖：COOP/COEP/CORP/HSTS/CSP/ETag/Cache-Control 头、304 协商缓存、206 Range、
 * 预压缩 .br/.gz 支持、isMainModule 守卫、HTTPS 模式（tlsCert/tlsKey 注入与文件读取）。
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

/** 通过 HTTPS 发起请求（用于 TLS 模式测试，自签证书需 rejectUnauthorized:false）。 */
function requestHttps(
  handle: ServerHandle,
  pathName: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: handle.options.host,
        port: handle.options.port,
        path: pathName,
        method: 'GET',
        headers,
        rejectUnauthorized: false,
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

  it('should default to HTTP mode when no TLS cert/key provided', () => {
    // 不传 TLS 选项时，handle.server 应为 http.Server 实例
    expect(handle.server).toBeInstanceOf(http.Server);
    expect(handle.server).not.toBeInstanceOf(https.Server);
    expect(handle.options.tlsEnabled).toBe(false);
  });
});

describe('Static Server HTTPS Mode (E-28)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-server-https-'));
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!DOCTYPE html><html><body>home</body></html>',
    );
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hello");');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should call https.createServer when tlsCertPath and tlsKeyPath are provided', () => {
    // 模拟 fs.readFileSync 返回 dummy 证书/私钥内容
    const readFileSyncSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation((filePath: unknown) => {
        if (filePath === '/fake/cert.pem') return 'FAKE_CERT_CONTENT';
        if (filePath === '/fake/key.pem') return 'FAKE_KEY_CONTENT';
        return '';
      });

    // 模拟 https.createServer 避免触发真实 PEM 解析（dummy 证书会抛 OpenSSL 错误）。
    // 返回一个支持 close() 的 mock 对象，确保 handle.close() 不抛错。
    const mockServer = {
      listen: vi.fn(),
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb();
        return mockServer;
      }),
      address: vi.fn(() => null),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    };
    const createHttpsServerSpy = vi
      .spyOn(https, 'createServer')
      .mockImplementation((() => mockServer as unknown as https.Server) as never);

    const handle = createServer({
      staticDir: tmpDir,
      tlsCertPath: '/fake/cert.pem',
      tlsKeyPath: '/fake/key.pem',
    });

    try {
      expect(readFileSyncSpy).toHaveBeenCalledWith('/fake/cert.pem', 'utf8');
      expect(readFileSyncSpy).toHaveBeenCalledWith('/fake/key.pem', 'utf8');
      expect(createHttpsServerSpy).toHaveBeenCalledTimes(1);
      expect(createHttpsServerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cert: 'FAKE_CERT_CONTENT',
          key: 'FAKE_KEY_CONTENT',
        }),
        expect.any(Function),
      );
      expect(handle.options.tlsEnabled).toBe(true);
      expect(handle.options.tlsCert).toBe('FAKE_CERT_CONTENT');
      expect(handle.options.tlsKey).toBe('FAKE_KEY_CONTENT');
      // 第二个参数（请求处理器）应为函数
      const callArgs = createHttpsServerSpy.mock.calls[0];
      expect(typeof callArgs?.[1]).toBe('function');
    } finally {
      handle.close();
      readFileSyncSpy.mockRestore();
      createHttpsServerSpy.mockRestore();
    }
  });

  it('should prefer inline tlsCert/tlsKey over file paths', () => {
    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');

    // 同样需要 mock https.createServer 以避免 OpenSSL 解析 INLINE_CERT 抛错
    const mockServer = {
      listen: vi.fn(),
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb();
        return mockServer;
      }),
      address: vi.fn(() => null),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    };
    const createHttpsServerSpy = vi
      .spyOn(https, 'createServer')
      .mockImplementation((() => mockServer as unknown as https.Server) as never);

    const handle = createServer({
      staticDir: tmpDir,
      tlsCertPath: '/should/not/be/read/cert.pem',
      tlsKeyPath: '/should/not/be/read/key.pem',
      tlsCert: 'INLINE_CERT',
      tlsKey: 'INLINE_KEY',
    });

    try {
      expect(readFileSyncSpy).not.toHaveBeenCalled();
      expect(handle.options.tlsEnabled).toBe(true);
      expect(handle.options.tlsCert).toBe('INLINE_CERT');
      expect(handle.options.tlsKey).toBe('INLINE_KEY');
      // 验证 https.createServer 被调用且使用内联值
      expect(createHttpsServerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cert: 'INLINE_CERT',
          key: 'INLINE_KEY',
        }),
        expect.any(Function),
      );
    } finally {
      handle.close();
      readFileSyncSpy.mockRestore();
      createHttpsServerSpy.mockRestore();
    }
  });

  it('should fall back to HTTP when fs.readFileSync fails (cert/key files missing)', () => {
    const readFileSyncSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation(() => {
        const err: NodeJS.ErrnoException = new Error('ENOENT: no such file');
        err.code = 'ENOENT';
        throw err;
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = createServer({
      staticDir: tmpDir,
      tlsCertPath: '/nonexistent/cert.pem',
      tlsKeyPath: '/nonexistent/key.pem',
    });

    try {
      expect(handle.server).toBeInstanceOf(http.Server);
      expect(handle.server).not.toBeInstanceOf(https.Server);
      expect(handle.options.tlsEnabled).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]?.[0] ?? '';
      expect(String(warnMsg)).toContain('falling back to HTTP');
    } finally {
      handle.close();
      readFileSyncSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('should fall back to HTTP when only --tls-cert is provided (missing --tls-key)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = createServer({
      staticDir: tmpDir,
      tlsCertPath: '/fake/cert.pem',
      // tlsKeyPath 缺失
    });

    try {
      expect(handle.server).toBeInstanceOf(http.Server);
      expect(handle.options.tlsEnabled).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]?.[0] ?? '';
      expect(String(warnMsg)).toContain('--tls-key missing');
    } finally {
      handle.close();
      warnSpy.mockRestore();
    }
  });

  it('should fall back to HTTP when only --tls-key is provided (missing --tls-cert)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = createServer({
      staticDir: tmpDir,
      tlsKeyPath: '/fake/key.pem',
      // tlsCertPath 缺失
    });

    try {
      expect(handle.server).toBeInstanceOf(http.Server);
      expect(handle.options.tlsEnabled).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls[0]?.[0] ?? '';
      expect(String(warnMsg)).toContain('--tls-cert missing');
    } finally {
      handle.close();
      warnSpy.mockRestore();
    }
  });

  // 端到端 HTTPS 请求测试：需要 openssl 生成自签证书；不可用时跳过。
  // 在 macOS / Linux CI 环境通常预装 openssl。
  const certPath = path.join(os.tmpdir(), 'solar-server-test-cert.pem');
  const keyPath = path.join(os.tmpdir(), 'solar-server-test-key.pem');
  let testTlsCert: string | null = null;
  let testTlsKey: string | null = null;

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj "/CN=localhost" 2>/dev/null`,
    );
    testTlsCert = fs.readFileSync(certPath, 'utf8');
    testTlsKey = fs.readFileSync(keyPath, 'utf8');
  } catch {
    testTlsCert = null;
    testTlsKey = null;
  }

  const httpsIt = testTlsCert && testTlsKey ? it : it.skip;

  httpsIt(
    'should serve over HTTPS and expose HSTS header on HTTPS responses',
    async () => {
      const handle = createServer({
        staticDir: tmpDir,
        port: 0,
        host: '127.0.0.1',
        tlsCert: testTlsCert!,
        tlsKey: testTlsKey!,
      });

      await new Promise<void>((resolve) => {
        handle.server.listen(0, '127.0.0.1', () => resolve());
      });
      const address = handle.server.address();
      if (address && typeof address === 'object') {
        (handle.options as { port: number }).port = address.port;
      }

      try {
        expect(handle.server).toBeInstanceOf(https.Server);
        const res = await requestHttps(handle, '/app.js');
        expect(res.status).toBe(200);
        // HSTS 头在 HTTPS 模式下必须存在
        const hsts = res.headers['strict-transport-security'];
        expect(hsts).toBeDefined();
        expect(hsts).toContain('max-age=63072000');
        expect(hsts).toContain('includeSubDomains');
        expect(hsts).toContain('preload');
        // 其他安全头也应在 HTTPS 响应中存在
        expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
        expect(res.headers['content-security-policy']).toContain("default-src 'self'");
        // 内容应正常返回
        expect(res.body.toString()).toBe('console.log("hello");');
      } finally {
        await handle.close();
      }
    },
  );

  httpsIt('should serve HTML with no-cache over HTTPS', async () => {
    const handle = createServer({
      staticDir: tmpDir,
      port: 0,
      host: '127.0.0.1',
      tlsCert: testTlsCert!,
      tlsKey: testTlsKey!,
    });

    await new Promise<void>((resolve) => {
      handle.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = handle.server.address();
    if (address && typeof address === 'object') {
      (handle.options as { port: number }).port = address.port;
    }

    try {
      const res = await requestHttps(handle, '/');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-type']).toContain('text/html');
    } finally {
      await handle.close();
    }
  });
});
