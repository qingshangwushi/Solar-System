#!/usr/bin/env bash
# 输出系统信息 + release server 状态。
#
# 用法：
#   ./release/server/diagnose.sh
#
# 打印 OS / Node / Python / OpenSSL 版本、release 目录结构、server PID/日志等。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${SCRIPT_DIR}/server.pid"
LOG_FILE="${SCRIPT_DIR}/server.log"

echo "[INFO] Solar-System release 诊断"
echo "========================================"
echo ""

echo "## 系统信息"
echo "  OS:        $(uname -s)"
echo "  OS 版本:   $(uname -r)"
echo "  架构:      $(uname -m)"
echo "  主机名:    $(hostname 2>/dev/null || echo unknown)"
if command -v node >/dev/null 2>&1; then
  echo "  Node:      $(node --version 2>/dev/null || echo unknown)"
fi
if command -v python3 >/dev/null 2>&1; then
  echo "  Python:    $(python3 --version 2>&1 || echo unknown)"
fi
if command -v openssl >/dev/null 2>&1; then
  echo "  OpenSSL:   $(openssl version 2>/dev/null || echo unknown)"
fi
if command -v shasum >/dev/null 2>&1; then
  echo "  shasum:    $(shasum -v 2>/dev/null || echo unknown)"
fi
echo ""

echo "## Release 信息"
echo "  release 目录: ${RELEASE_DIR}"
echo "  server 目录:  ${SCRIPT_DIR}"
if [[ -f "${RELEASE_DIR}/manifests/manifest.json" ]]; then
  echo "  manifest:    ${RELEASE_DIR}/manifests/manifest.json"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json; m=json.load(open('${RELEASE_DIR}/manifests/manifest.json')); print(f\"  version:     {m.get('version','?')}\"); print(f\"  buildDate:   {m.get('buildDate','?')}\"); print(f\"  fileCount:   {m.get('fileCount','?')}\")" 2>/dev/null || true
  fi
else
  echo "  manifest:    不存在"
fi
echo ""

echo "## Server 状态"
if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  if kill -0 "${PID}" 2>/dev/null; then
    echo "  状态:        运行中"
    echo "  PID:         ${PID}"
    ps -p "${PID}" -o pid,ppid,etime,command= 2>/dev/null || true
  else
    echo "  状态:        进程已退出（PID=${PID} 失效）"
  fi
else
  echo "  状态:        未运行"
fi
echo ""

echo "## Release 目录结构"
( cd "${RELEASE_DIR}" && ls -la 2>/dev/null ) || true
echo ""

echo "## Server 日志（最后 20 行）"
if [[ -f "${LOG_FILE}" ]]; then
  tail -n 20 "${LOG_FILE}" 2>/dev/null || echo "  （无法读取日志）"
else
  echo "  日志文件不存在"
fi
echo ""

echo "[INFO] 诊断完成"
