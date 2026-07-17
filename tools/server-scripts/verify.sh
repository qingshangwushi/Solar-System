#!/usr/bin/env bash
# 验证 release server 健康：HTTP 健康检查 + TLS 校验。
#
# 用法：
#   ./release/server/verify.sh [--url http://127.0.0.1:8080/]
#
# 当 URL 为 https:// 开头时，自动使用 openssl 进行 TLS 证书校验。
set -euo pipefail

URL="${URL:-http://127.0.0.1:8080/}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    -h|--help)
      echo "用法: $0 [--url http://127.0.0.1:8080/]"
      exit 0 ;;
    *) echo "[ERROR] 未知参数: $1" >&2; exit 1 ;;
  esac
done

echo "[INFO] 验证 release server"
echo "    URL: ${URL}"

# 解析 host 与 port
PROTO="${URL%%://*}"
REST="${URL#*://}"
HOST_PORT="${REST%%/*}"
HOST="${HOST_PORT%%:*}"
PORT="${HOST_PORT##*:}"
if [[ "${HOST}" == "${HOST_PORT}" ]]; then
  if [[ "${PROTO}" == "https" ]]; then
    PORT="443"
  else
    PORT="80"
  fi
fi

# ---- HTTP 健康检查 ----
http_ok=0
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null -w "HTTP %{http_code}\n" --max-time 10 "${URL}"; then
    http_ok=1
  fi
elif command -v wget >/dev/null 2>&1; then
  if wget -q -O /dev/null --timeout=10 "${URL}"; then
    http_ok=1
    echo "HTTP 200"
  fi
else
  echo "[WARN] 未找到 curl/wget，跳过 HTTP 健康检查" >&2
fi

if [[ "${http_ok}" -eq 1 ]]; then
  echo "[INFO] HTTP 健康检查: PASS"
else
  echo "[ERROR] HTTP 健康检查: FAIL" >&2
  exit 1
fi

# ---- TLS 校验（仅对 https URL）----
if [[ "${PROTO}" == "https" ]]; then
  echo "[INFO] TLS 校验: ${HOST}:${PORT}"
  if ! command -v openssl >/dev/null 2>&1; then
    echo "[WARN] 未找到 openssl，跳过 TLS 校验" >&2
  else
    if echo | openssl s_client -connect "${HOST}:${PORT}" -servername "${HOST}" 2>/dev/null \
        | grep -q "Verify return code: 0 (ok)"; then
      echo "[INFO] TLS 校验: PASS"
    else
      echo "[ERROR] TLS 校验: FAIL（证书无效或不可信）" >&2
      exit 1
    fi
  fi
fi

echo "[INFO] 验证完成"
