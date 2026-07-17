# asset-downloader

> 修复审查报告 N-06 / E-31：填充 `assets-src/{bodies,effects,terrain}/` 公开资产

`assets-src/` 在审查中指出全部仅含 `.gitkeep`、无任何真实资产文件。本工具负责：

1. **文档化真实公开数据源**：NASA / USGS / JPL 影像与高程 DEM 的官方 URL（记录在 `ASSET_CATALOG` 中）
2. **HTTP 下载**：支持 Range 头断点续传 + SHA-256 校验（默认关闭，因大文件下载耗时且可能需要登录）
3. **过程式占位资产生成**：默认使用 PIL/numpy 程序生成小尺寸 PNG 纹理与简化高程 .bin，**不依赖任何网络**
4. **manifest 登记**：按 S/A/B/C 分层登记全部资产到 `assets-src/manifest.json`

## 入口

```bash
# 默认：生成过程式占位资产 + manifest.json（不依赖网络，推荐）
python tools/asset-downloader/download_assets.py

# 仅生成某一类
python tools/asset-downloader/download_assets.py --target=bodies
python tools/asset-downloader/download_assets.py --target=terrain
python tools/asset-downloader/download_assets.py --target=effects

# 仅打印将要处理的资产清单（不写任何文件）
python tools/asset-downloader/download_assets.py --dry-run

# 真实下载 NASA/USGS 影像（需要可靠外网，默认关闭；下载失败自动回退到过程式生成）
python tools/asset-downloader/download_assets.py --download --target=all

# 仅基于已存在的资产文件重新生成 manifest.json
python tools/asset-downloader/download_assets.py --manifest-only

# 自定义项目根目录与 manifest 输出路径
python tools/asset-downloader/download_assets.py --root /path/to/project --manifest-out /path/to/manifest.json
```

## 生成的资产清单

### `assets-src/bodies/`（天体纹理贴图，PNG）

| 文件 | 尺寸 | 层级 | 数据源 |
|------|------|------|--------|
| `sun.png` | 1024x512 | S | NASA SOHO EIT 304Å |
| `earth.png` | 1024x512 | S | NASA Visible Earth Blue Marble |
| `moon.png` | 512x256 | S | USGS LRO LROC WAC 全球月球影像 |
| `mars.png` | 512x256 | A | USGS Mars MGS MOLA DEM |
| `jupiter.png` | 512x256 | A | NASA JPL Cassini Jupiter 全球带状云图 |

### `assets-src/terrain/`（高程 DEM，裸二进制 float32）

| 文件 | 网格 | 层级 | 数据源 |
|------|------|------|--------|
| `earth_elevation.bin` | 64x32 | S | NASA SRTM 30m DEM |
| `moon_elevation.bin` | 64x32 | S | NASA LRO LOLA DEM |
| `mars_elevation.bin` | 64x32 | A | USGS Mars MGS MOLA DEM |

二进制布局：64×32×4 = 8192 字节，小端 float32，行优先（C order），单位米。

### `assets-src/effects/`（特效素材，PNG）

| 文件 | 尺寸 | 层级 | 用途 |
|------|------|------|------|
| `noise_256.png` | 256x256 | C | shader 噪声采样 |
| `corona_512.png` | 512x512 RGBA | C | 太阳日冕径向渐变 |
| `star_field_1024.png` | 1024x512 | C | 背景星空 |

## 资产分层（S/A/B/C）

与 `data-src/normalized/catalog.json` 中的 `asset_tier` 字段对齐：

| 层级 | 含义 | 覆盖范围 |
|------|------|----------|
| **S** | 核心可见天体（太阳/地球/月球） | 必须有纹理 + 高程 |
| **A** | 主要行星（火星/木星等） | 至少有纹理 |
| **B** | 次要卫星（土卫六等） | 占位即可 |
| **C** | 远景与特效（星空/噪声/corona） | 不绑定具体天体 |

## manifest.json 结构

输出到 `assets-src/manifest.json`，schema `solar-system-assets-manifest/v1`：

```jsonc
{
  "schema": "solar-system-assets-manifest/v1",
  "version": "0.1.0",
  "generated": "procedural",
  "root": "<绝对路径>",
  "layer_definition": { "S": "...", "A": "...", "B": "...", "C": "..." },
  "total_assets": 11,
  "total_size_bytes": 12345,
  "by_layer": { "S": 5, "A": 3, "C": 3 },
  "assets": [
    {
      "id": "earth_texture",
      "name": "Earth Blue Marble texture (procedural placeholder)",
      "type": "texture",            // texture | elevation | effect
      "path": "assets-src/bodies/earth.png",
      "layer": "S",                 // S | A | B | C
      "size_bytes": 12345,
      "sha256": "<64 hex>",
      "source_url": "https://visibleearth.nasa.gov/...",
      "license": "NASA Public Domain",
      "procedural": true
    }
  ]
}
```

## 公开数据源 URL

工具在 `ASSET_CATALOG` 中文档化了以下真实公开数据源，便于后续真实下载替换占位资产：

- **NASA Visible Earth (Blue Marble)**：https://visibleearth.nasa.gov/images/73593/eastern-hemisphere
- **NASA SVS (Science Visualization Studio)**：https://svs.gsfc.nasa.gov/
- **NASA SOHO (太阳 EIT/MDI 影像)**：https://soho.nascom.nasa.gov/data/REPROCESSING/
- **NASA Planetary Photojournal (JPL)**：https://photojournal.jpl.nasa.gov/
- **USGS Astrogeology**：
  - 火星 MOLA DEM：https://astrogeology.usgs.gov/search/map/Mars/Global/Mars_MGS_MOLA_DEM_mosaic_global_463m
  - 月球 LRO WAC：https://astrogeology.usgs.gov/search/map/Moon/LRO/LRO_LWAC_global_100m_june2015
- **NASA LRO LOLA 月球高程 DEM**：https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- **NASA SRTM 地球 DEM**：https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/（需 NASA Earthdata 登录）
- **NASA PDS (Planetary Data System)**：https://pds.nasa.gov/

> 以上数据源均为 NASA / USGS 公开领域（Public Domain）数据，可自由用于本项目。

## 关键函数

### `download_file(url, dest, expected_sha256=None, ..., session=None) -> str`

HTTP 下载远程文件到 `dest`：

1. 若 `dest` 已存在部分内容，发送 `Range: bytes=N-` 头续传
2. 服务器返回 200 表示不支持 Range，覆盖重下；返回 206 表示续传成功
3. 下载完成后若提供 `expected_sha256` 则校验，不匹配则删除并重试
4. 失败按指数退避（`retry_backoff^attempt` 秒）重试 `max_retries` 次

`session` 参数可注入 `requests.Session` 的 mock，便于单元测试。

### `verify_sha256(path, expected) -> bool`

分块计算文件 SHA-256 并与预期值比较（大小写不敏感）。

### `generate_procedural_asset(spec, root) -> str`

根据 `ASSET_CATALOG` 中的 spec 调用对应生成函数（`gen_sun_texture` / `gen_earth_elevation` 等），将文件写入 `<root>/<spec.path>`，返回绝对路径。

### `build_manifest(root) -> dict`

扫描 `ASSET_CATALOG` 中已在磁盘上存在的资产，构建 manifest 对象（含 SHA-256、size、layer 统计）。

## 测试

```bash
# 运行全部测试（mock requests，不依赖网络）
python -m pytest tools/asset-downloader/

# 运行单个测试文件
python -m pytest tools/asset-downloader/test_download_assets.py -v
python -m pytest tools/asset-downloader/test_manifest.py -v
```

测试覆盖：
- `test_download_assets.py`：mock `requests.Session` 测试 HTTP 下载、Range 续传、SHA-256 校验、重试退避、过程式生成器输出维度
- `test_manifest.py`：manifest JSON 合法性、每个资产文件存在、SHA-256 匹配、S/A/B/C 分层覆盖

## 依赖

- **必选**：Python 3.9+ 标准库（`argparse`、`hashlib`、`json`、`math`、`os`、`sys`、`time`、`typing`）
- **过程式生成**：`Pillow` (PIL) + `numpy`
- **真实下载**（可选）：`requests`
- **测试**（可选）：`pytest`

```bash
pip install Pillow numpy requests pytest
```
