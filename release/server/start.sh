#!/usr/bin/env bash
# 启动 release 中的 server（静态资源服务器）。
#
# 用法：
#   ./release/server/start.sh [--port 8080] [--host 0.0.0.0]
#
# 默认从 release/web/ 目录启动一个 Python http.server，监听 8080 端口。
# 进程 PID 写入 release/server/server.pid，日志写入 release/server/server.log。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${RELEASE_DIR}/web"

PORT="${PORT:-8080}"
HOST="${HOST:-0.0.0.0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    -h|--help)
      echo "用法: $0 [--port 8080] [--host 0.0.0.0]"
      exit 0 ;;
    *) echo "[ERROR] 未知参数: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "${WEB_DIR}" ]]; then
  echo "[ERROR] release/web 不存在，请先运行 tools/build-release.sh" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] 未找到 python3，无法启动静态服务器" >&2
  exit 1
fi

PID_FILE="${SCRIPT_DIR}/server.pid"
LOG_FILE="${SCRIPT_DIR}/server.log"

if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  echo "[WARN] server 已在运行，PID=$(cat "${PID_FILE}")" >&2
  exit 0
fi

cd "${WEB_DIR}"
nohup python3 -m http.server "${PORT}" --bind "${HOST}" > "${LOG_FILE}" 2>&1 &
SERVER_PID=$!
echo "${SERVER_PID}" > "${PID_FILE}"

echo "[INFO] release server 已启动"
echo "    PID:  ${SERVER_PID}"
echo "    URL:  http://${HOST}:${PORT}/"
echo "    日志: ${LOG_FILE}"
echo "    停止: ./release/server/stop.sh"
