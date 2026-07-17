#!/usr/bin/env bash
# release 构建脚本（修复 E-30 / 任务 T-P1-15）。
#
# 聚合 dist + pkg + data + assets + manifests + licenses + checksums，
# 生成版本化 release/ 目录，并产出 version.json 与 SHA-256 校验清单。
#
# 用法：
#   ./tools/build-release.sh [version]
#   VERSION=0.2.0 ./tools/build-release.sh
#
# 依赖：pnpm、wasm-pack（可选；缺失时跳过 WASM 构建并告警）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# ---- 版本号 ----
VERSION="${1:-${VERSION:-}}"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(node -e "console.log(require('./package.json').version)")"
fi
RELEASE_DIR="${ROOT_DIR}/release/releases/${VERSION}"
STAGE_DIR="${RELEASE_DIR}/solar-system-${VERSION}"

echo "==> 构建版本：${VERSION}"
echo "==> 发布目录：${RELEASE_DIR}"

# ---- 清理旧产物 ----
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}/"{dist,pkg,data,assets,manifests,licenses}

# ---- 1. WASM 构建 ----
if command -v wasm-pack >/dev/null 2>&1; then
  echo "==> [1/6] 构建 WASM (pnpm build:wasm)"
  if ! pnpm build:wasm; then
    echo "WARN: WASM 构建失败，继续（可能缺少 rust 工具链）" >&2
  fi
else
  echo "WARN: wasm-pack 未安装，跳过 WASM 构建" >&2
fi

# ---- 2. 应用构建 ----
echo "==> [2/6] 构建应用 (pnpm build)"
if ! pnpm build; then
  echo "WARN: pnpm build 失败，继续（部分包可能无构建产物）" >&2
fi

# ---- 3. 聚合 Web 产物 ----
echo "==> [3/6] 聚合 dist"
if [[ -d "${ROOT_DIR}/apps/web/dist" ]]; then
  cp -R "${ROOT_DIR}/apps/web/dist/." "${STAGE_DIR}/dist/"
else
  echo "WARN: apps/web/dist 不存在" >&2
fi

# ---- 4. 聚合 WASM pkg ----
echo "==> [4/6] 聚合 pkg (WASM)"
if [[ -d "${ROOT_DIR}/packages/astro-core-wasm/pkg" ]]; then
  cp -R "${ROOT_DIR}/packages/astro-core-wasm/pkg/." "${STAGE_DIR}/pkg/"
else
  echo "WARN: packages/astro-core-wasm/pkg 不存在" >&2
fi

# ---- 5. 聚合 data + assets ----
echo "==> [5/6] 聚合 data + assets"
if [[ -d "${ROOT_DIR}/data-src/normalized" ]]; then
  cp -R "${ROOT_DIR}/data-src/normalized/." "${STAGE_DIR}/data/"
fi
if [[ -d "${ROOT_DIR}/assets-src" ]]; then
  cp -R "${ROOT_DIR}/assets-src/." "${STAGE_DIR}/assets/"
fi

# ---- 6. licenses ----
echo "==> [6/6] 聚合 licenses"
LICENSES_SRC="${ROOT_DIR}/release/licenses"
if [[ -d "${LICENSES_SRC}" ]]; then
  cp -R "${LICENSES_SRC}/." "${STAGE_DIR}/licenses/"
fi
# 内联 LICENSE
if [[ -f "${ROOT_DIR}/LICENSE" ]]; then
  cp "${ROOT_DIR}/LICENSE" "${STAGE_DIR}/licenses/LICENSE"
fi

# ---- 生成 version.json manifest ----
echo "==> 生成 version.json"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_COMMIT="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
cat > "${STAGE_DIR}/manifests/version.json" <<EOF
{
  "version": "${VERSION}",
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "gitCommit": "${GIT_COMMIT}",
  "schema": "solar-system-release/v1",
  "components": {
    "web": "dist/",
    "wasm": "pkg/",
    "data": "data/",
    "assets": "assets/"
  }
}
EOF

# ---- 生成 SHA-256 校验清单 ----
echo "==> 生成 SHA-256 校验清单"
CHECKSUMS_FILE="${STAGE_DIR}/manifests/checksums.sha256"
(
  cd "${STAGE_DIR}"
  find dist pkg data assets licenses -type f 2>/dev/null | sort | while read -r f; do
    sha256sum "$f"
  done
) > "${CHECKSUMS_FILE}"

# 同时生成根级 checksums 供 release/checksums/ 索引
mkdir -p "${ROOT_DIR}/release/checksums"
cp "${CHECKSUMS_FILE}" "${ROOT_DIR}/release/checksums/checksums-${VERSION}.sha256"

# ---- 生成 manifest.json（顶层聚合清单）----
TOTAL_SIZE="$(du -sb "${STAGE_DIR}" | cut -f1)"
FILE_COUNT="$(find "${STAGE_DIR}" -type f | wc -l | tr -d ' ')"
cat > "${STAGE_DIR}/manifests/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "gitCommit": "${GIT_COMMIT}",
  "totalSizeBytes": ${TOTAL_SIZE},
  "fileCount": ${FILE_COUNT},
  "checksums": "manifests/checksums.sha256",
  "dependencies": {
    "wasm": "pkg/astro_core.js",
    "web": "dist/index.html"
  }
}
EOF

# ---- 打包 tarball ----
echo "==> 打包 tarball"
TARBALL="${RELEASE_DIR}/solar-system-${VERSION}.tar.gz"
tar -czf "${TARBALL}" -C "${RELEASE_DIR}" "solar-system-${VERSION}"
TARBALL_SHA="$(sha256sum "${TARBALL}" | cut -d' ' -f1)"
echo "${TARBALL_SHA}  solar-system-${VERSION}.tar.gz" > "${RELEASE_DIR}/solar-system-${VERSION}.tar.gz.sha256"

echo
echo "==> 发布完成：${RELEASE_DIR}"
echo "    tarball:    ${TARBALL}"
echo "    sha256:     ${TARBALL_SHA}"
echo "    文件数:     ${FILE_COUNT}"
echo "    总大小:     ${TOTAL_SIZE} bytes"
