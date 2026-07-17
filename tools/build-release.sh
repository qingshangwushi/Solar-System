#!/usr/bin/env bash
# release 构建脚本（修复 E-30 / Task 12）。
#
# 聚合 apps/web/dist + packages/astro-core-wasm/pkg + data-src/normalized +
# assets-src + manifests + licenses + checksums + server 脚本，
# 生成 release/ 目录并产出 SHA-256 校验清单与多文件 manifest。
#
# 用法：
#   ./tools/build-release.sh [--dry-run] [--clean] [--no-checksums]
#
# 选项：
#   --dry-run        预览模式，不执行实际拷贝/写入
#   --clean          清理 release/ 下产物后重建（保留 manifests/ 目录）
#   --no-checksums   跳过 SHA-256 校验和生成
#
# 依赖：bash、shasum/sha256sum、cp、find、python3（生成 manifest.json）
# 不依赖外部网络。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# ---- 颜色输出 ----
if [[ -t 2 ]]; then
  C_INFO='\033[0;36m'
  C_WARN='\033[0;33m'
  C_ERROR='\033[0;31m'
  C_RESET='\033[0m'
else
  C_INFO=''
  C_WARN=''
  C_ERROR=''
  C_RESET=''
fi

log_info()  { printf "${C_INFO}[INFO]%s${C_RESET} %s\n" "" "$*" >&2; }
log_warn()  { printf "${C_WARN}[WARN]%s${C_RESET} %s\n" "" "$*" >&2; }
log_error() { printf "${C_ERROR}[ERROR]%s${C_RESET} %s\n" "" "$*" >&2; }

# ---- 参数解析 ----
DRY_RUN=0
CLEAN=0
NO_CHECKSUMS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=1; shift ;;
    --clean)        CLEAN=1; shift ;;
    --no-checksums) NO_CHECKSUMS=1; shift ;;
    -h|--help)
      sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) log_error "未知参数: $1"; exit 1 ;;
  esac
done

# ---- 工具检测 ----
if command -v shasum >/dev/null 2>&1; then
  SHA256_CMD=(shasum -a 256)
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256_CMD=(sha256sum)
else
  log_error "未找到 shasum 或 sha256sum，无法计算 SHA-256"
  exit 1
fi

compute_sha256() {
  local file="$1"
  "${SHA256_CMD[@]}" "$file" | awk '{print $1}'
}

# 选择 python3 解释器
PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done

# ---- 版本号 ----
if [[ -f "${ROOT_DIR}/package.json" ]] && command -v node >/dev/null 2>&1; then
  VERSION="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.1.0")"
else
  VERSION="0.1.0"
fi

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RELEASE_DIR="${ROOT_DIR}/release"

log_info "Solar-System release 构建脚本"
log_info "版本:        ${VERSION}"
log_info "构建日期:    ${BUILD_DATE}"
log_info "release 目录: ${RELEASE_DIR}"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  log_info "运行模式:    DRY-RUN（仅预览，不写入文件）"
fi
if [[ "${NO_CHECKSUMS}" -eq 1 ]]; then
  log_info "校验和:      已禁用（--no-checksums）"
fi

# ---- 清理 ----
if [[ "${CLEAN}" -eq 1 ]]; then
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log_info "[dry-run] 将清理 release/{web,wasm,data,assets,licenses,server,checksums}"
  else
    log_info "清理 release/ 下产物（保留 manifests/ 目录）"
    for d in web wasm data assets licenses server checksums; do
      rm -rf "${RELEASE_DIR}/${d}"
      mkdir -p "${RELEASE_DIR}/${d}"
    done
  fi
fi

# 始终清理待生成的文件，避免多轮构建时旧文件污染哈希计算
if [[ "${DRY_RUN}" -eq 0 ]]; then
  rm -f "${RELEASE_DIR}/checksums/checksums.sha256" 2>/dev/null || true
  rm -f "${RELEASE_DIR}/checksums/checksums.sha256.asc" 2>/dev/null || true
  rm -f "${RELEASE_DIR}/manifests/manifest.json" 2>/dev/null || true
fi

# ---- 辅助函数：拷贝目录 ----
copy_dir() {
  local src="$1"
  local dst="$2"
  local label="$3"
  if [[ ! -d "${src}" ]]; then
    log_warn "${label}: 源目录不存在，跳过 → ${src}"
    return 0
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    local count
    count="$(find "${src}" -type f | wc -l | tr -d ' ')"
    log_info "[dry-run] 拷贝 ${label}: ${src} → ${dst}（${count} 个文件）"
    return 0
  fi
  mkdir -p "${dst}"
  cp -R "${src}/." "${dst}/"
  log_info "${label}: 已拷贝 ${src} → ${dst}"
}

# ============================================================
# 步骤 1/6: 聚合 Web 产物
# ============================================================
log_info "步骤 1/6: 聚合 apps/web/dist → release/web/"
copy_dir "${ROOT_DIR}/apps/web/dist" "${RELEASE_DIR}/web" "web"

# ============================================================
# 步骤 2/6: 聚合 WASM pkg
# ============================================================
log_info "步骤 2/6: 聚合 packages/astro-core-wasm/pkg → release/wasm/"
copy_dir "${ROOT_DIR}/packages/astro-core-wasm/pkg" "${RELEASE_DIR}/wasm" "wasm"

# ============================================================
# 步骤 3/6: 聚合 data + assets
# ============================================================
log_info "步骤 3/6: 聚合 data-src/normalized → release/data/"
copy_dir "${ROOT_DIR}/data-src/normalized" "${RELEASE_DIR}/data" "data"

log_info "步骤 3/6: 聚合 assets-src → release/assets/"
copy_dir "${ROOT_DIR}/assets-src" "${RELEASE_DIR}/assets" "assets"

# ============================================================
# 步骤 4/6: 拷贝/生成 LICENSE 与第三方 license
# ============================================================
log_info "步骤 4/6: 聚合 LICENSE 与第三方 license"
LICENSES_DIR="${RELEASE_DIR}/licenses"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  if [[ -f "${ROOT_DIR}/LICENSE" ]]; then
    log_info "[dry-run] 拷贝根目录 LICENSE → ${LICENSES_DIR}/LICENSE"
  else
    log_info "[dry-run] 将生成 MIT LICENSE（Solar-System, 2026）→ ${LICENSES_DIR}/LICENSE"
  fi
  log_info "[dry-run] 将生成 THIRD_PARTY.md → ${LICENSES_DIR}/THIRD_PARTY.md"
else
  mkdir -p "${LICENSES_DIR}"
  if [[ -f "${ROOT_DIR}/LICENSE" ]]; then
    cp "${ROOT_DIR}/LICENSE" "${LICENSES_DIR}/LICENSE"
    log_info "LICENSE: 已拷贝根目录 LICENSE"
  else
    cat > "${LICENSES_DIR}/LICENSE" <<'EOF'
MIT License

Copyright (c) 2026 Solar-System

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
    log_info "LICENSE: 已生成 MIT LICENSE（项目名 Solar-System, 年份 2026）"
  fi

  cat > "${LICENSES_DIR}/THIRD_PARTY.md" <<'EOF'
# Third-Party Licenses

本项目使用以下主要开源依赖。完整依赖列表与版本请参见各 `package.json` 与 `Cargo.toml`。

## 核心运行时

### React
- License: MIT
- Homepage: https://reactjs.org/
- 用途：前端 UI 组件框架

### TypeScript
- License: Apache-2.0
- Homepage: https://www.typescriptlang.org/
- 用途：静态类型系统与编译器

### Vite
- License: MIT
- Homepage: https://vitejs.dev/
- 用途：前端构建与开发服务器

## 测试

### Vitest
- License: MIT
- Homepage: https://vitest.dev/
- 用途：单元测试框架

## WASM 与 Rust

### wasm-pack
- License: MIT OR Apache-2.0
- Homepage: https://rustwasm.github.io/wasm-pack/
- 用途：Rust → WebAssembly 打包工具

### Rust toolchain
- License: MIT OR Apache-2.0
- Homepage: https://www.rust-lang.org/
- 用途：编写 astro-core 内核并通过 wasm-pack 编译为 WASM

## 样式与格式化

### Tailwind CSS
- License: MIT
- Homepage: https://tailwindcss.com/
- 用途：CSS 工具类框架

### PostCSS
- License: MIT
- Homepage: https://postcss.org/
- 用途：CSS 后处理器

### Prettier
- License: MIT
- Homepage: https://prettier.io/
- 用途：代码格式化

## 包管理

### pnpm
- License: MIT
- Homepage: https://pnpm.io/
- 用途：包管理与 workspace 编排
EOF
  log_info "THIRD_PARTY.md: 已生成"
fi

# ============================================================
# 步骤 5/6: 拷贝 server 脚本到 release/server/
# ============================================================
log_info "步骤 5/6: 拷贝 server 脚本到 release/server/"
SERVER_SCRIPTS_SRC="${ROOT_DIR}/tools/server-scripts"
SERVER_DST="${RELEASE_DIR}/server"
if [[ ! -d "${SERVER_SCRIPTS_SRC}" ]]; then
  log_warn "tools/server-scripts 不存在，跳过 server 脚本拷贝"
else
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    sc_count="$(find "${SERVER_SCRIPTS_SRC}" -type f -name '*.sh' | wc -l | tr -d ' ')"
    log_info "[dry-run] 拷贝 ${sc_count} 个 server 脚本 → ${SERVER_DST}"
  else
    mkdir -p "${SERVER_DST}"
    cp -R "${SERVER_SCRIPTS_SRC}/." "${SERVER_DST}/"
    # 确保可执行
    find "${SERVER_DST}" -name '*.sh' -type f -exec chmod +x {} \; 2>/dev/null || true
    log_info "server 脚本已拷贝到 ${SERVER_DST}"
  fi
fi

# ============================================================
# 步骤 6/6: 生成 SHA-256 校验清单
# ============================================================
if [[ "${NO_CHECKSUMS}" -eq 1 ]]; then
  log_info "步骤 6/6: 跳过 SHA-256 校验和生成（--no-checksums）"
else
  log_info "步骤 6/6: 生成 SHA-256 校验清单"
  CHECKSUMS_DIR="${RELEASE_DIR}/checksums"
  CHECKSUMS_FILE="${CHECKSUMS_DIR}/checksums.sha256"
  ASC_FILE="${CHECKSUMS_DIR}/checksums.sha256.asc"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log_info "[dry-run] 将计算 release/ 下所有文件的 SHA-256 → ${CHECKSUMS_FILE}"
    log_info "[dry-run] 将生成完整性文件 → ${ASC_FILE}"
  else
    mkdir -p "${CHECKSUMS_DIR}"
    : > "${CHECKSUMS_FILE}"
    # 计算 release/ 下所有文件，排除 checksums.sha256、.asc、manifest.json 自身、.gitkeep
    (
      cd "${RELEASE_DIR}"
      find . -type f \
        ! -path "./checksums/checksums.sha256" \
        ! -path "./checksums/checksums.sha256.asc" \
        ! -path "./manifests/manifest.json" \
        ! -name ".gitkeep" \
        -print | sort | while IFS= read -r f; do
        rel="${f#./}"
        hash="$(compute_sha256 "${RELEASE_DIR}/${rel}")"
        printf "%s  %s\n" "${hash}" "${rel}"
      done
    ) > "${CHECKSUMS_FILE}"

    file_count="$(wc -l < "${CHECKSUMS_FILE}" | tr -d ' ')"
    log_info "checksums.sha256: 已生成 ${file_count} 条记录"

    # 生成 .asc 完整性文件（含 checksums.sha256 自身的 sha256）
    asc_hash="$(compute_sha256 "${CHECKSUMS_FILE}")"
    cat > "${ASC_FILE}" <<EOF
# Solar-System release checksums integrity file
# 简化完整性校验文件（非 GPG 签名）。
# 文件内含 checksums.sha256 自身的 SHA-256，用于检测 checksums.sha256 是否被篡改。
# 如需强签名，请使用: gpg --detach-sign --armor checksums.sha256
checksums_sha256: ${asc_hash}
generated: ${BUILD_DATE}
version: ${VERSION}
EOF
    log_info "checksums.sha256.asc: 已生成（含 checksums.sha256 自身 sha256）"
  fi
fi

# ============================================================
# 步骤 7: 生成多文件 manifest.json（内联 Python 脚本）
# ============================================================
log_info "步骤 7: 生成 release/manifests/manifest.json"
MANIFEST_FILE="${RELEASE_DIR}/manifests/manifest.json"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  log_info "[dry-run] 将生成 manifest.json → ${MANIFEST_FILE}"
else
  if [[ -z "${PYTHON_BIN}" ]]; then
    log_error "未找到 python3 或 python，无法生成 manifest.json"
    exit 1
  fi
  mkdir -p "${RELEASE_DIR}/manifests"
  "${PYTHON_BIN}" - "${RELEASE_DIR}" "${VERSION}" "${BUILD_DATE}" "${MANIFEST_FILE}" <<'PYEOF'
import hashlib
import json
import os
import sys
from pathlib import Path

release_dir = Path(sys.argv[1])
version = sys.argv[2]
build_date = sys.argv[3]
manifest_file = Path(sys.argv[4])

CATEGORY_MAP = {
    "web": "web",
    "wasm": "wasm",
    "data": "data",
    "assets": "assets",
    "licenses": "licenses",
    "server": "server",
    "checksums": "checksums",
    "manifests": "manifests",
}

def categorize(rel_path: str) -> str:
    top = rel_path.split("/", 1)[0]
    return CATEGORY_MAP.get(top, "other")

def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

files = []
for root, dirs, filenames in os.walk(release_dir):
    for name in sorted(filenames):
        if name == ".gitkeep":
            continue
        full = Path(root) / name
        rel = os.path.relpath(full, release_dir)
        # 排除 manifest.json 自身（避免自引用）
        if rel == "manifests/manifest.json":
            continue
        try:
            size = full.stat().st_size
        except OSError:
            size = 0
        try:
            sha = sha256_of(full)
        except OSError:
            sha = ""
        files.append({
            "path": rel,
            "size": size,
            "sha256": sha,
            "category": categorize(rel),
        })

files.sort(key=lambda x: x["path"])

# 按分类汇总
by_category = {}
for f in files:
    by_category.setdefault(f["category"], 0)
    by_category[f["category"]] += 1

total_size = sum(f["size"] for f in files)

manifest = {
    "schema": "solar-system-release-manifest/v2",
    "version": version,
    "buildDate": build_date,
    "fileCount": len(files),
    "totalSizeBytes": total_size,
    "byCategory": by_category,
    "files": files,
}

with manifest_file.open("w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"[INFO] manifest.json: 已生成 {len(files)} 条文件记录", file=sys.stderr)
PYEOF
fi

# ============================================================
# 汇总
# ============================================================
log_info "构建完成。"
if [[ "${DRY_RUN}" -eq 0 ]]; then
  log_info "release/ 顶层内容："
  (cd "${RELEASE_DIR}" && ls -la) >&2 || true
fi
