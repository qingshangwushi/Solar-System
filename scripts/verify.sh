#!/usr/bin/env bash
# 验证 Web3D 太阳系项目环境与依赖（Linux/macOS）。
#
# 用法：
#   ./scripts/verify.sh
#
# 检查项：
#   1. Node.js >= 20
#   2. pnpm >= 10
#   3. Rust toolchain（cargo + wasm-pack，仅警告）
#   4. node_modules 完整性
#   5. data-src/normalized/catalog.json 存在
#   6. 关键 workspace 包可达
#   7. typecheck 通过

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

issues=()
ok=()

echo "==> 环境验证"

# 1. Node
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version)"
  NODE_MAJOR="${NODE_VERSION#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    ok+=("Node $NODE_VERSION (>= 20)")
  else
    issues+=("Node 版本过低：$NODE_VERSION，需 >= 20")
  fi
else
  issues+=("Node.js 未安装或不在 PATH")
fi

# 2. pnpm
if command -v pnpm >/dev/null 2>&1; then
  PNPM_VERSION="$(pnpm --version)"
  PNPM_MAJOR="${PNPM_VERSION%%.*}"
  if [[ "$PNPM_MAJOR" -ge 10 ]]; then
    ok+=("pnpm $PNPM_VERSION (>= 10)")
  else
    issues+=("pnpm 版本过低：$PNPM_VERSION，需 >= 10")
  fi
else
  issues+=("pnpm 未安装或不在 PATH")
fi

# 3. Rust
if command -v rustc >/dev/null 2>&1; then
  RUST_VERSION="$(rustc --version)"
  ok+=("Rust: $RUST_VERSION")
  if command -v wasm-pack >/dev/null 2>&1; then
    WASM_PACK_VERSION="$(wasm-pack --version)"
    ok+=("wasm-pack: $WASM_PACK_VERSION")
  else
    issues+=("wasm-pack 未安装（WASM 构建将不可用，运行 cargo install wasm-pack 修复）")
  fi
else
  issues+=("Rust toolchain 未安装（仅影响 WASM 构建）")
fi

# 4. node_modules
if [[ -d node_modules ]]; then
  ok+=("node_modules 已安装")
else
  issues+=("node_modules 缺失，请运行 pnpm install")
fi

# 5. catalog.json
if [[ -f data-src/normalized/catalog.json ]]; then
  SIZE="$(wc -c < data-src/normalized/catalog.json | tr -d ' ')"
  ok+=("catalog.json 存在（$SIZE 字节）")
else
  issues+=("data-src/normalized/catalog.json 不存在，请运行 python tools/catalog-pipeline/build_catalog.py")
fi

# 6. 关键 workspace 包
for pkg in packages/server packages/renderer-core packages/terrain-engine apps/web; do
  if [[ -f "$pkg/package.json" ]]; then
    ok+=("  - $pkg")
  else
    issues+=("缺少 workspace 包：$pkg")
  fi
done

# 7. typecheck
echo ""
echo "==> 运行 typecheck（pnpm -r typecheck）"
if pnpm -r typecheck; then
  ok+=("typecheck 通过")
else
  issues+=("typecheck 失败（exit $?）")
fi

# 输出
echo ""
echo "==> 通过项"
for item in "${ok[@]}"; do
  echo "    [OK] $item"
done

if [[ ${#issues[@]} -gt 0 ]]; then
  echo ""
  echo "==> 问题项"
  for item in "${issues[@]}"; do
    echo "    [FAIL] $item"
  done
  echo ""
  echo "验证失败：${#issues[@]} 个问题"
  exit 1
else
  echo ""
  echo "所有检查通过"
  exit 0
fi
