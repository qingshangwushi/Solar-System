#!/usr/bin/env bash
# 停止 Web3D 太阳系开发服务器（Linux/macOS）。
#
# 用法：
#   ./scripts/stop.sh [PORT ...]
#
# 默认释放 8080、5173 端口，并清理残留的 vite/solar-server 进程。

set -uo pipefail

PORTS=("${@:-8080 5173}")
[[ ${#PORTS[@]} -eq 0 ]] && PORTS=(8080 5173)

echo "==> 停止 Web3D 太阳系开发服务器"

killed=0

# 1. 按端口查找并终止监听进程
for port in "${PORTS[@]}"; do
  pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -lptn "sport = :$port" 2>/dev/null | awk 'NR>1 {sub(/.*pid=/, "", $0); sub(/,.*/, "", $0); print}' | sort -u || true)"
  fi

  if [[ -z "$pids" ]]; then
    echo "    端口 $port：无监听进程"
    continue
  fi

  for pid in $pids; do
    if [[ -z "$pid" ]]; then continue; fi
    proc_name="$(ps -p "$pid" -o comm= 2>/dev/null || echo unknown)"
    if kill "$pid" 2>/dev/null; then
      echo "    端口 $port：终止进程 $pid ($proc_name)"
      killed=$((killed + 1))
    fi
  done
done

# 2. 兜底：清理残留的 vite/solar-server 进程
for name in vite solar-server; do
  pids="$(pgrep -x "$name" 2>/dev/null || true)"
  for pid in $pids; do
    if kill "$pid" 2>/dev/null; then
      echo "    终止残留进程 $pid ($name)"
      killed=$((killed + 1))
    fi
  done
done

if [[ "$killed" -eq 0 ]]; then
  echo "    未发现运行中的开发服务器"
else
  echo "    共终止 $killed 个进程"
fi
