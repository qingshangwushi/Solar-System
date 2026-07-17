#!/usr/bin/env python3
"""manifest 构建管线（设计文档 14.3 / 修复 E-42）。

遍历 `data-src/normalized/` 与 `assets-src/` 全部文件，生成 manifest.json：
- 每条记录包含 path、size、sha256、dependencies（依目录约定推断）
- 使用分块 SHA-256（_sha256）以支持大文件流式哈希
- _walk_root 递归扫描目录，跳过 .gitkeep 等占位文件

输出 schema：solar-system-manifest/v1

用法：
    python tools/manifest-builder/build_manifest.py [--root .] [--out release/manifests/manifest.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from typing import Any

# 跳过这些占位文件
_SKIP_FILES = {".gitkeep", ".DS_Store"}

# 默认扫描根目录下的子目录
DEFAULT_SCAN_DIRS = ("data-src/normalized", "assets-src")

# 按目录前缀推断依赖关系
_DEP_RULES = (
    ("assets-src/bodies", ["data-src/normalized/catalog.json"]),
    ("assets-src/terrain", ["data-src/normalized/ephemeris"]),
    ("assets-src/effects", []),
    ("data-src/normalized", []),
)


def _sha256(path: str, chunk_size: int = 1 << 20) -> str:
    """分块计算文件 SHA-256（默认 1 MiB 块）。

    流式读取以避免大文件一次性加载到内存。返回 64 位小写十六进制摘要。
    """
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _infer_dependencies(rel_path: str) -> list[str]:
    """根据相对路径推断依赖项。

    - bodies/* 依赖 catalog.json
    - terrain/* 依赖 ephemeris 文件
    - 其他无依赖
    """
    for prefix, deps in _DEP_RULES:
        if rel_path.startswith(prefix):
            return list(deps)
    return []


def _walk_root(root: str, scan_subdirs: tuple[str, ...]) -> list[dict[str, Any]]:
    """递归扫描 root 下的 scan_subdirs，返回每条文件的 manifest 记录。

    跳过 .gitkeep 等占位文件。每条记录：
        {
            "path": "<相对 root 的路径>",
            "size": <字节>,
            "sha256": "<64 hex>",
            "dependencies": [<相对路径>...]
        }
    """
    entries: list[dict[str, Any]] = []
    for sub in scan_subdirs:
        sub_abs = os.path.join(root, sub)
        if not os.path.isdir(sub_abs):
            continue
        for dirpath, _dirnames, filenames in os.walk(sub_abs):
            for fname in sorted(filenames):
                if fname in _SKIP_FILES:
                    continue
                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, root).replace(os.sep, "/")
                size = os.path.getsize(abs_path)
                digest = _sha256(abs_path)
                entries.append({
                    "path": rel_path,
                    "size": size,
                    "sha256": digest,
                    "dependencies": _infer_dependencies(rel_path),
                })
    return entries


def build_manifest(root: str, scan_subdirs: tuple[str, ...] = DEFAULT_SCAN_DIRS) -> dict[str, Any]:
    """构建完整 manifest 对象。"""
    entries = _walk_root(root, scan_subdirs)

    total_size = sum(e["size"] for e in entries)
    by_top: dict[str, int] = {}
    for e in entries:
        top = e["path"].split("/")[0] if "/" in e["path"] else e["path"]
        by_top[top] = by_top.get(top, 0) + 1

    return {
        "schema": "solar-system-manifest/v1",
        "version": "0.1.0",
        "generated": "smoke",
        "root": os.path.abspath(root),
        "scan_dirs": list(scan_subdirs),
        "total_files": len(entries),
        "total_size": total_size,
        "by_top_level": by_top,
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 manifest.json")
    parser.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                        help="项目根目录（默认：tools/manifest-builder 的上两级）")
    parser.add_argument("--out", default=None,
                        help="输出路径（默认：<root>/release/manifests/manifest.json）")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    manifest = build_manifest(root)

    out_path = os.path.abspath(args.out) if args.out else os.path.join(root, "release", "manifests", "manifest.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"==> manifest.json 已生成：{out_path}")
    print(f"    总文件数：{manifest['total_files']}")
    print(f"    总字节数：{manifest['total_size']}")
    for top, count in sorted(manifest["by_top_level"].items()):
        print(f"    {top}: {count} 文件")


if __name__ == "__main__":
    main()
