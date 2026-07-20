#!/usr/bin/env python3
"""
带 COOP/COEP 头的静态资源服务器（设计文档 31.3）。

- 监听 0.0.0.0:8080（接受来自 LAN/外网 IP 的访问）
- 自动注入 Cross-Origin-Opener-Policy: same-origin
- 自动注入 Cross-Origin-Embedder-Policy: require-corp
- 自动注入 Cross-Origin-Resource-Policy: same-origin（让 WASM/JS 在 COEP 下可加载）
- .wasm → application/wasm，.ts → text/javascript，.js → text/javascript
- 默认 serve apps/web/dist 目录
- 支持 HTTPS（设计文档 31.3：局域网推荐 HTTPS，WebGPU 需安全上下文）
  --tls-cert / --tls-key 启用 HTTPS
"""
from __future__ import annotations

import argparse
import http.server
import socketserver
import ssl
import sys
from pathlib import Path

# 扩展 MIME 类型（覆盖 Vite 产物中的 .wasm / .ts）
ADDITIONAL_MIMETYPES = {
    '.wasm': 'application/wasm',
    '.ts': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
}

# 在 SimpleHTTPRequestHandler 之前先把扩展名 → MIME 注入到默认 mime.types
import mimetypes  # noqa: E402
for ext, mime in ADDITIONAL_MIMETYPES.items():
    mimetypes.add_type(mime, ext)


class CoopCoepHandler(http.server.SimpleHTTPRequestHandler):
    """注入 COOP/COEP/CORP 头的请求处理器。"""

    # 关闭 stderr 中的访问日志噪音（保留到 stdout 可选）
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

    def end_headers(self) -> None:  # noqa: D401
        # 设计文档 31.3：跨源隔离头
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        # 缓存策略：开发期不缓存，保证改了 dist 立即生效
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


def main() -> int:
    parser = argparse.ArgumentParser(description='COOP/COEP static server')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument(
        '--directory',
        default=str(Path(__file__).resolve().parents[2] / 'apps' / 'web' / 'dist'),
        help='要 serve 的目录（默认 apps/web/dist）',
    )
    parser.add_argument(
        '--tls-cert',
        default=None,
        help='TLS 证书文件路径（PEM）。提供后启用 HTTPS（设计文档 31.3）',
    )
    parser.add_argument(
        '--tls-key',
        default=None,
        help='TLS 私钥文件路径（PEM）。与 --tls-cert 同时提供时启用 HTTPS',
    )
    args = parser.parse_args()

    web_dir = Path(args.directory).resolve()
    if not web_dir.is_dir():
        print(f'[ERROR] 目录不存在: {web_dir}', file=sys.stderr)
        return 1

    # 判断是否启用 HTTPS
    tls_enabled = bool(args.tls_cert) and bool(args.tls_key)
    if bool(args.tls_cert) != bool(args.tls_key):
        print('[WARN] --tls-cert 与 --tls-key 必须同时提供，回退到 HTTP', file=sys.stderr)

    # SimpleHTTPRequestHandler 支持通过 directory 参数指定根目录（Python 3.7+）
    handler = lambda *parts, **kw: CoopCoepHandler(  # noqa: E731
        *parts, **kw, directory=str(web_dir)
    )

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        if tls_enabled:
            # 设计文档 31.3：HTTPS 支持，WebGPU 需安全上下文
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=args.tls_cert, keyfile=args.tls_key)
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            print(f'[INFO] Serving {web_dir}')
            print(f'[INFO] Listening on https://{args.host}:{args.port}/')
            print('[INFO] HTTPS enabled (设计文档 31.3)')
        else:
            print(f'[INFO] Serving {web_dir}')
            print(f'[INFO] Listening on http://{args.host}:{args.port}/')
            print('[INFO] HTTPS not enabled (use --tls-cert/--tls-key to enable)')
        print(
            '[INFO] COOP/COEP/CORP headers injected (设计文档 31.3 cross-origin isolation)'
        )
        print('[INFO] Ctrl+C to stop')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n[INFO] Shutting down...')
        finally:
            httpd.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())