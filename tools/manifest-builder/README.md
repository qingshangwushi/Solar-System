# manifest-builder

> 设计文档 14.3 / 修复 E-42

`manifest.json` 构建管线：递归扫描 `data-src/normalized/` 与 `assets-src/`，为每个文件生成分块 SHA-256、大小与依赖关系记录。

## 入口

```bash
# 默认输出到 release/manifests/manifest.json
python tools/manifest-builder/build_manifest.py

# 自定义根目录与输出路径
python tools/manifest-builder/build_manifest.py --root /path/to/project --out /path/to/manifest.json
```

## 输出

`release/manifests/manifest.json`，结构：

```jsonc
{
  "schema": "solar-system-manifest/v1",
  "version": "0.1.0",
  "generated": "smoke",
  "root": "<绝对路径>",
  "scan_dirs": ["data-src/normalized", "assets-src"],
  "total_files": 1,
  "total_size": 12345,
  "by_top_level": { "data-src": 1, "assets-src": 0 },
  "entries": [
    {
      "path": "data-src/normalized/catalog.json",
      "size": 12345,
      "sha256": "<64 hex>",
      "dependencies": []
    }
  ]
}
```

### 单条 entry 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| path | string | 相对 root 的 POSIX 风格路径 |
| size | integer | 文件字节数 |
| sha256 | string | 64 位小写十六进制 SHA-256 摘要 |
| dependencies | string[] | 该资源依赖的其他 manifest 条目路径 |

## 辅助函数

### `_sha256(path: str, chunk_size: int = 1 << 20) -> str`

分块计算文件 SHA-256（默认 1 MiB 块）。流式读取以避免大文件一次性加载到内存。

```python
_sha256("data-src/normalized/catalog.json")
# 'a3f5b8...<64 hex>'
```

### `_infer_dependencies(rel_path: str) -> list[str]`

根据相对路径前缀推断依赖项：

- `assets-src/bodies/*` → 依赖 `data-src/normalized/catalog.json`
- `assets-src/terrain/*` → 依赖 `data-src/normalized/ephemeris`（前缀匹配）
- `assets-src/effects/*` → 无依赖
- `data-src/normalized/*` → 无依赖

### `_walk_root(root: str, scan_subdirs: tuple[str, ...]) -> list[dict]`

递归扫描 `root` 下的 `scan_subdirs`，跳过 `.gitkeep`、`.DS_Store` 等占位文件。返回每条文件的 manifest 记录列表。

```python
_walk_root("/workspace", ("data-src/normalized", "assets-src"))
# [
#   {"path": "data-src/normalized/catalog.json", "size": ..., "sha256": ..., "dependencies": []},
#   ...
# ]
```

## 验证

```bash
python tools/manifest-builder/build_manifest.py
# 期望输出包含 catalog.json 条目，sha256 为 64 位十六进制
```

## 依赖

仅 Python 3.9+ 标准库（`argparse`、`hashlib`、`json`、`os`、`typing`）。
