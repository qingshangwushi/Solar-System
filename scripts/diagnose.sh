#!/usr/bin/env bash
# 收集 Web3D 太阳系项目诊断信息并生成报告（Linux/macOS）。
#
# 用法：
#   ./scripts/diagnose.sh [--out PATH] [--skip-tests]
#
# 生成 JSON 诊断包，包含：
#   - 系统信息（OS/CPU/内存/Node/pnpm/Rust 版本）
#   - 项目元信息（版本、workspace 根路径）
#   - 端口占用情况
#   - 关键文件清单与大小
#   - typecheck 结果
#   - 测试结果
# 输出到 release/checksums/diagnostics-<timestamp>.json

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

OUT=""
SKIP_TESTS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    -h|--help)
      echo "用法: $0 [--out PATH] [--skip-tests]"
      exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

echo "==> 收集诊断信息"

# 收集系统信息
collect_field() {
  local label="$1"
  local cmd="$2"
  local val
  val="$(eval "$cmd" 2>/dev/null || echo 'null')"
  if [[ "$val" == "null" || -z "$val" ]]; then
    echo "null"
  else
    # 转义 JSON 字符串里的双引号与反斜杠
    echo "$val" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
  fi
}

# 系统信息
NODE_VERSION="$(node --version 2>/dev/null || echo 'null')"
PNPM_VERSION="$(pnpm --version 2>/dev/null || echo 'null')"
RUST_VERSION="$(rustc --version 2>/dev/null | sed -e 's/"/\\"/g' || echo 'null')"
WASM_PACK_VERSION="$(wasm-pack --version 2>/dev/null | sed -e 's/"/\\"/g' || echo 'null')"
HOSTNAME="$(hostname 2>/dev/null || echo 'unknown')"
OS_INFO="$(uname -s 2>/dev/null || echo 'unknown')"
OS_RELEASE="$(uname -r 2>/dev/null || echo 'unknown')"
ARCH="$(uname -m 2>/dev/null || echo 'unknown')"
CPU_INFO="$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ *//' | sed -e 's/"/\\"/g' || echo 'null')"
CPU_CORES="$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo '0')"
MEM_TOTAL_KB="$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo '0')"
MEM_FREE_KB="$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}' || echo '0')"

# 项目信息
PROJ_NAME="$(node -p "require('./package.json').name" 2>/dev/null || echo 'unknown')"
PROJ_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 'unknown')"
PROJ_PM="$(node -p "require('./package.json').packageManager" 2>/dev/null || echo 'unknown')"
PROJ_ROOT="$(pwd)"

# 端口占用
ports_json="["
first=1
for port in 8080 5173; do
  pid=""
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  elif command -v ss >/dev/null 2>&1; then
    pid="$(ss -lptn "sport = :$port" 2>/dev/null | awk 'NR>1 {sub(/.*pid=/, "", $0); sub(/,.*/, "", $0); print; exit}' || true)"
  fi
  if [[ -z "$pid" ]]; then
    entry="{\"port\":$port,\"state\":\"free\"}"
  else
    proc_name="$(ps -p "$pid" -o comm= 2>/dev/null || echo 'unknown')"
    entry="{\"port\":$port,\"state\":\"listen\",\"pid\":$pid,\"process\":\"$proc_name\"}"
  fi
  if [[ $first -eq 0 ]]; then ports_json+=","; fi
  ports_json+="$entry"
  first=0
done
ports_json+="]"

# 关键文件
files_json="["
first=1
for f in data-src/normalized/catalog.json \
         data-src/normalized/search-index.json \
         data-src/normalized/benchmark.json \
         release/manifests/manifest.json \
         packages/server/src/server.ts \
         packages/renderer-core/src/productization.ts \
         packages/terrain-engine/src/index.ts \
         tools/build-release.sh; do
  if [[ -f "$f" ]]; then
    size="$(wc -c < "$f" | tr -d ' ')"
    mtime="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo '0')"
    entry="{\"path\":\"$f\",\"exists\":true,\"size\":$size,\"modified\":$mtime}"
  else
    entry="{\"path\":\"$f\",\"exists\":false}"
  fi
  if [[ $first -eq 0 ]]; then files_json+=","; fi
  files_json+="$entry"
  first=0
done
files_json+="]"

# typecheck
echo "    运行 typecheck..."
TC_OUTPUT="$(pnpm -r typecheck 2>&1 || true)"
TC_EXIT=$?
TC_PASSED="false"
[[ $TC_EXIT -eq 0 ]] && TC_PASSED="true"
TC_OUTPUT_ESC="$(printf '%s' "$TC_OUTPUT" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')"

# 测试
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  echo "    运行测试..."
  TEST_OUTPUT="$(pnpm -r test 2>&1 || true)"
  TEST_EXIT=$?
  TEST_PASSED="false"
  [[ $TEST_EXIT -eq 0 ]] && TEST_PASSED="true"
  TEST_OUTPUT_ESC="$(printf '%s' "$TEST_OUTPUT" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')"
  TESTS_BLOCK="\"exit_code\":$TEST_EXIT,\"passed\":$TEST_PASSED,\"output\":\"${TEST_OUTPUT_ESC}\""
else
  TESTS_BLOCK="\"skipped\":true"
fi

# 时间戳
TS="$(date -u +%Y%m%d-%H%M%S)"
GEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 默认输出路径
if [[ -z "$OUT" ]]; then
  OUT="release/checksums/diagnostics-$TS.json"
fi
mkdir -p "$(dirname "$OUT")"

# 写出 JSON
cat > "$OUT" <<EOF
{
  "schema": "solar-system-diagnostics/v1",
  "generated_at": "$GEN_AT",
  "system": {
    "os": "$OS_INFO",
    "os_version": "$OS_RELEASE",
    "arch": "$ARCH",
    "hostname": "$HOSTNAME",
    "cpu": "$CPU_INFO",
    "cpu_cores": $CPU_CORES,
    "memory_total_mb": $(awk "BEGIN {printf \"%.1f\", $MEM_TOTAL_KB / 1024}" 2>/dev/null || echo 'null'),
    "memory_free_mb": $(awk "BEGIN {printf \"%.1f\", $MEM_FREE_KB / 1024}" 2>/dev/null || echo 'null'),
    "node_version": "$NODE_VERSION",
    "pnpm_version": "$PNPM_VERSION",
    "rust_version": "$RUST_VERSION",
    "wasm_pack_version": "$WASM_PACK_VERSION"
  },
  "project": {
    "name": "$PROJ_NAME",
    "version": "$PROJ_VERSION",
    "package_manager": "$PROJ_PM",
    "workspace_root": "$PROJ_ROOT"
  },
  "ports": $ports_json,
  "files": $files_json,
  "typecheck": {
    "exit_code": $TC_EXIT,
    "passed": $TC_PASSED,
    "output": "$TC_OUTPUT_ESC"
  },
  "tests": {
    $TESTS_BLOCK
  }
}
EOF

# 摘要
LISTEN_COUNT="$(echo "$ports_json" | grep -o '"state":"listen"' | wc -l | tr -d ' ')"
FILE_OK_COUNT="$(echo "$files_json" | grep -o '"exists":true' | wc -l | tr -d ' ')"
FILE_TOTAL=8

echo ""
echo "==> 诊断报告已生成：$OUT"
if [[ "$TC_PASSED" == "true" ]]; then
  echo "    typecheck: PASS"
else
  echo "    typecheck: FAIL"
fi
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  if [[ "$TEST_PASSED" == "true" ]]; then
    echo "    tests:     PASS"
  else
    echo "    tests:     FAIL"
  fi
fi
echo "    端口监听:   $LISTEN_COUNT 个"
echo "    关键文件:   $FILE_OK_COUNT / $FILE_TOTAL 存在"
