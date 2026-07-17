#!/usr/bin/env bash
# 停止 release server。
#
# 用法：
#   ./release/server/stop.sh
#
# 读取 release/server/server.pid 并向进程发送 SIGTERM，必要时 SIGKILL。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/server.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "[WARN] PID 文件不存在（${PID_FILE}），server 可能未运行" >&2
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if [[ -z "${PID}" ]]; then
  echo "[WARN] PID 文件为空" >&2
  rm -f "${PID_FILE}"
  exit 0
fi

if ! kill -0 "${PID}" 2>/dev/null; then
  echo "[WARN] 进程 ${PID} 不存在，清理 PID 文件" >&2
  rm -f "${PID_FILE}"
  exit 0
fi

kill "${PID}" 2>/dev/null || true
echo "[INFO] 已发送 SIGTERM 给 PID=${PID}"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "${PID}" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if kill -0 "${PID}" 2>/dev/null; then
  kill -9 "${PID}" 2>/dev/null || true
  echo "[WARN] 进程未响应 SIGTERM，已强制终止 PID=${PID}"
else
  echo "[INFO] server 已停止（PID=${PID}）"
fi

rm -f "${PID_FILE}"
