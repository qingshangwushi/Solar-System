#!/usr/bin/env bash
# 启动 Web3D 太阳系开发环境（Linux/macOS）。
#
# 用法：
#   ./scripts/start.sh [--port 8080] [--no-install]
#
# 流程：
#   1. 检查 Node/pnpm 版本
#   2. 安装依赖（若 node_modules 缺失）
#   3. 启动 dev 服务器（前台运行，Ctrl+C 退出）

set -euo pipefail

PORT="${PORT:-8080}"
NO_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-install) NO_INSTALL=1; shift ;;
    -h|--help)
      echo "用法: $0 [--port 8080] [--no-install]"
      exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

# 切到项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> 启动 Web3D 太阳系开发环境"

# 1. 检查 Node
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 未安装或不在 PATH。请安装 Node.js >= 20。" >&2
  exit 1
fi
NODE_VERSION="$(node --version)"
echo "    Node: $NODE_VERSION"

# 2. 检查 pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm 未安装。请运行 corepack enable 或 npm install -g pnpm。" >&2
  exit 1
fi
PNPM_VERSION="$(pnpm --version)"
echo "    pnpm: $PNPM_VERSION"

# 3. 依赖安装检查
if [[ "$NO_INSTALL" -eq 0 ]]; then
  if [[ ! -d node_modules ]]; then
    echo "==> 安装依赖（pnpm install）"
    pnpm install --no-frozen-lockfile
  else
    echo "    node_modules 已存在，跳过安装"
  fi
fi

# 4. 启动 dev
export PORT="$PORT"
export NODE_ENV=development

echo "==> 启动 dev 服务器（端口 $PORT）"
echo "    按 Ctrl+C 退出"
echo ""

exec pnpm dev
