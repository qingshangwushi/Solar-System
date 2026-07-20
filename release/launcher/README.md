# Launcher

启动器脚本（设计文档 31.4）。

## 用法

```bash
# 启动静态服务器（HTTP，默认 0.0.0.0:8080）
./start.sh

# 启动静态服务器（HTTPS，需要证书）
./start.sh --tls-cert=/path/to/cert.pem --tls-key=/path/to/key.pem

# 停止服务器
./stop.sh

# 验证服务器状态
./verify.sh
```

launcher/ 与 server/ 的区别：launcher/ 面向最终用户，提供一键启停入口；
server/ 包含服务器实现代码（serve_with_coop.py、Node.js server.ts 等）。
