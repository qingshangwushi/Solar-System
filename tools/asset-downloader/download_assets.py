#!/usr/bin/env python3
"""assets-src 公开资产下载器与过程式占位生成器（修复 N-06 / E-31）。

本工具解决审查报告 N-06 / E-31 指出的 `assets-src/{bodies,effects,terrain}/`
全部仅含 `.gitkeep`、无任何真实资产文件的问题。

策略：
1. **真实数据源文档化**：在 `ASSET_CATALOG` 中记录 NASA / USGS / JPL 公开影像
   与高程数据的官方 URL（行星纹理贴图、地球/月球/火星高程 DEM、特效素材）。
2. **HTTP 下载**：支持 Range 头断点续传 + SHA-256 校验，可通过 `--download` 真实
   拉取远程文件（默认关闭，因网络不可靠且大文件耗时）。
3. **过程式占位资产**：默认使用 PIL/numpy 程序生成小尺寸占位资产（噪声 + 渐变），
   用于验证 manifest 登记与渲染管线接入，**不依赖任何网络**。
4. **manifest 登记**：将所有资产按 S/A/B/C 分层登记到 `assets-src/manifest.json`。

公开数据源（仅文档化，不强制下载）：
- NASA Visible Earth (Blue Marble 地球全球贴图)
  https://visibleearth.nasa.gov/images/73593/eastern-hemisphere
- NASA SVS (Science Visualization Studio, 太阳/行星纹理)
  https://svs.gsfc.nasa.gov/
- NASA SOHO (太阳 EIT/MDI 影像)
  https://soho.nascom.nasa.gov/data/REPROCESSING/
- NASA Planetary Photojournal (JPL 行星影像档案)
  https://photojournal.jpl.nasa.gov/
- USGS Astrogeology (火星 MOLA DEM / 月球 LRO WAC / 水星 MESSENGER)
  https://astrogeology.usgs.gov/search/map/Mars/Global/Mars_MGS_MOLA_DEM_mosaic_global_463m
  https://astrogeology.usgs.gov/search/map/Moon/LRO/LRO_LWAC_global_100m_june2015
- NASA LRO LOLA (月球高程 DEM)
  https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- NASA SRTM (地球 Shuttle Radar Topography Mission DEM)
  https://dwtkns.com/srtm30m/  或  https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/
- NASA PDS (Planetary Data System)
  https://pds.nasa.gov/

资产分层（与 catalog.json 的 asset_tier 对齐）：
- **S**：核心可见天体（太阳、地球、月球）—— 必须有纹理 + 高程
- **A**：主要行星（火星、木星等）—— 至少有纹理
- **B**：次要卫星（土卫六等）—— 占位即可
- **C**：远景与特效（星空、噪声、corona）—— 不绑定具体天体

用法：
    # 默认：生成过程式占位资产 + manifest.json（不依赖网络）
    python tools/asset-downloader/download_assets.py

    # 仅生成某一类
    python tools/asset-downloader/download_assets.py --target=bodies
    python tools/asset-downloader/download_assets.py --target=terrain
    python tools/asset-downloader/download_assets.py --target=effects

    # 仅打印将要处理的资产清单（不写文件）
    python tools/asset-downloader/download_assets.py --dry-run

    # 真实下载 NASA/USGS 影像（需要可靠外网，默认关闭）
    python tools/asset-downloader/download_assets.py --download --target=all

    # 仅重新生成 manifest.json（基于已存在的资产文件）
    python tools/asset-downloader/download_assets.py --manifest-only
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from typing import Any

# ============================================================
# 资产目录（真实公开数据源 URL + 元信息）
# ============================================================
#
# source_url 字段记录官方公开数据源页面或直接文件 URL，便于后续真实下载。
# expected_sha256 仅用于真实下载校验；过程式生成的占位资产在写入后动态计算。

ASSET_CATALOG: list[dict[str, Any]] = [
    # ---- S 层：核心可见天体 ----
    {
        "id": "sun_texture",
        "name": "Sun surface texture (procedural placeholder)",
        "type": "texture",
        "layer": "S",
        "path": "assets-src/bodies/sun.png",
        "width": 1024, "height": 512,
        "source_url": "https://soho.nascom.nasa.gov/data/REPROCESSING/",
        "source_description": "NASA SOHO EIT 304Å 太阳极紫外影像（真实下载需获取近期合成图）",
        "license": "NASA Public Domain",
        "procedural": True,
    },
    {
        "id": "earth_texture",
        "name": "Earth Blue Marble texture (procedural placeholder)",
        "type": "texture",
        "layer": "S",
        "path": "assets-src/bodies/earth.png",
        "width": 1024, "height": 512,
        "source_url": "https://visibleearth.nasa.gov/images/73593/eastern-hemisphere",
        "source_description": "NASA Visible Earth Blue Marble 全球真彩色贴图",
        "license": "NASA Public Domain",
        "procedural": True,
    },
    {
        "id": "moon_texture",
        "name": "Moon LRO WAC texture (procedural placeholder)",
        "type": "texture",
        "layer": "S",
        "path": "assets-src/bodies/moon.png",
        "width": 512, "height": 256,
        "source_url": "https://astrogeology.usgs.gov/search/map/Moon/LRO/LRO_LWAC_global_100m_june2015",
        "source_description": "USGS LRO LROC WAC 全球月球影像 100m/px",
        "license": "NASA / USGS Public Domain",
        "procedural": True,
    },
    # ---- A 层：主要行星 ----
    {
        "id": "mars_texture",
        "name": "Mars MDIM texture (procedural placeholder)",
        "type": "texture",
        "layer": "A",
        "path": "assets-src/bodies/mars.png",
        "width": 512, "height": 256,
        "source_url": "https://astrogeology.usgs.gov/search/map/Mars/Global/Mars_MGS_MOLA_DEM_mosaic_global_463m",
        "source_description": "USGS Mars MGS MOLA DEM 全球火星高程镶嵌 463m/px",
        "license": "NASA / USGS Public Domain",
        "procedural": True,
    },
    {
        "id": "jupiter_texture",
        "name": "Jupiter atmosphere texture (procedural placeholder)",
        "type": "texture",
        "layer": "A",
        "path": "assets-src/bodies/jupiter.png",
        "width": 512, "height": 256,
        "source_url": "https://photojournal.jpl.nasa.gov/catalog/PIA07782",
        "source_description": "NASA JPL Cassini Jupiter 全球带状云图",
        "license": "NASA JPL Public Domain",
        "procedural": True,
    },
    # ---- terrain：S/A 层天体的高程 DEM（过程式简化版） ----
    {
        "id": "earth_elevation",
        "name": "Earth SRTM elevation (procedural placeholder 64x32)",
        "type": "elevation",
        "layer": "S",
        "path": "assets-src/terrain/earth_elevation.bin",
        "grid_w": 64, "grid_h": 32,
        "dtype": "float32",
        "source_url": "https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/",
        "source_description": "NASA SRTM 30m 全球 DEM（真实下载需 NASA Earthdata 登录）",
        "license": "NASA Public Domain",
        "procedural": True,
    },
    {
        "id": "moon_elevation",
        "name": "Moon LOLA elevation (procedural placeholder 64x32)",
        "type": "elevation",
        "layer": "S",
        "path": "assets-src/terrain/moon_elevation.bin",
        "grid_w": 64, "grid_h": 32,
        "dtype": "float32",
        "source_url": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
        "source_description": "NASA LRO LOLA 月球激光高度计 DEM",
        "license": "NASA PDS Public Domain",
        "procedural": True,
    },
    {
        "id": "mars_elevation",
        "name": "Mars MOLA elevation (procedural placeholder 64x32)",
        "type": "elevation",
        "layer": "A",
        "path": "assets-src/terrain/mars_elevation.bin",
        "grid_w": 64, "grid_h": 32,
        "dtype": "float32",
        "source_url": "https://astrogeology.usgs.gov/search/map/Mars/Global/Mars_MGS_MOLA_DEM_mosaic_global_463m",
        "source_description": "USGS Mars MGS MOLA DEM 全球火星高程",
        "license": "NASA / USGS Public Domain",
        "procedural": True,
    },
    # ---- effects：C 层特效素材 ----
    {
        "id": "noise_256",
        "name": "Perlin-like noise tile 256x256 (effects)",
        "type": "effect",
        "layer": "C",
        "path": "assets-src/effects/noise_256.png",
        "width": 256, "height": 256,
        "source_url": "https://www.opengl.org/archives/resources/code/samples/sig99/advanced99/notes/node108.html",
        "source_description": "通用程序噪声贴图（用于 shader 噪声采样）",
        "license": "Procedural / CC0",
        "procedural": True,
    },
    {
        "id": "corona_512",
        "name": "Sun corona radial gradient 512x512 (effects)",
        "type": "effect",
        "layer": "C",
        "path": "assets-src/effects/corona_512.png",
        "width": 512, "height": 512,
        "source_url": "https://svs.gsfc.nasa.gov/13471",
        "source_description": "NASA SVS 太阳日冕可视化（程序生成径向渐变占位）",
        "license": "NASA Public Domain",
        "procedural": True,
    },
    {
        "id": "star_field_1024",
        "name": "Star field 1024x512 (effects)",
        "type": "effect",
        "layer": "C",
        "path": "assets-src/effects/star_field_1024.png",
        "width": 1024, "height": 512,
        "source_url": "https://svs.gsfc.nasa.gov/4846",
        "source_description": "NASA SVS 银河背景星空（程序生成黑底白点星点）",
        "license": "NASA Public Domain",
        "procedural": True,
    },
]

# ============================================================
# 通用工具
# ============================================================

DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_MANIFEST = "assets-src/manifest.json"
SKIP_FILES = {".gitkeep", ".DS_Store"}


def _sha256(path: str, chunk_size: int = 1 << 20) -> str:
    """分块计算文件 SHA-256（默认 1 MiB 块）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def verify_sha256(path: str, expected: str) -> bool:
    """校验文件 SHA-256 是否与预期一致。"""
    actual = _sha256(path)
    return actual.lower() == expected.lower()


def _ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


# ============================================================
# HTTP 下载（支持断点续传 + SHA-256 校验）
# ============================================================

def download_file(
    url: str,
    dest: str,
    expected_sha256: str | None = None,
    chunk_size: int = 1 << 20,
    timeout: float = 30.0,
    max_retries: int = 3,
    retry_backoff: float = 2.0,
    session: Any = None,
) -> str:
    """下载远程文件到 dest，支持断点续传与 SHA-256 校验。

    实现：
    1. 若 dest 已存在部分内容，发送 `Range: bytes=N-` 头续传
    2. 服务器返回 200 表示不支持 Range，则覆盖重下；返回 206 表示续传成功
    3. 下载完成后若提供 expected_sha256 则校验，不匹配则删除并重试
    4. 失败按指数退避（retry_backoff^attempt 秒）重试 max_retries 次

    参数：
        session: 可选 requests.Session（便于测试注入 mock）；为 None 则实时创建

    返回 dest 路径。失败抛 RuntimeError。
    """
    if session is None:
        import requests  # 延迟导入，避免测试环境强制依赖
        session = requests.Session()

    _ensure_dir(dest)
    last_err: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            mode = "ab" if os.path.exists(dest) else "wb"
            existing = os.path.getsize(dest) if os.path.exists(dest) else 0
            headers = {"Range": f"bytes={existing}-"} if existing > 0 else {}

            resp = session.get(url, headers=headers, stream=True, timeout=timeout, allow_redirects=True)
            status = getattr(resp, "status_code", 0)

            if status not in (200, 206):
                raise RuntimeError(f"HTTP {status} for {url}")

            # 200 表示服务器忽略 Range，需覆盖写
            if status == 200 and existing > 0:
                mode = "wb"
                existing = 0

            with open(dest, mode) as f:
                for chunk in resp.iter_content(chunk_size=chunk_size):
                    if chunk:
                        f.write(chunk)

            # SHA-256 校验
            if expected_sha256 is not None:
                if not verify_sha256(dest, expected_sha256):
                    os.remove(dest)
                    raise RuntimeError(f"SHA-256 mismatch for {dest} (expected {expected_sha256})")

            return dest

        except Exception as exc:  # noqa: BLE001
            last_err = exc
            # 失败后等待退避再重试（最后一次不等待）
            if attempt < max_retries:
                wait = retry_backoff ** attempt
                time.sleep(wait)

    raise RuntimeError(f"download failed after {max_retries} attempts: {url} ({last_err})")


# ============================================================
# 过程式占位资产生成（PIL + numpy，不依赖网络）
# ============================================================

def _import_imaging() -> tuple[Any, Any]:
    """延迟导入 PIL 与 numpy，给出友好错误提示。"""
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - 环境问题
        raise RuntimeError("需要 Pillow 才能生成过程式纹理：pip install Pillow") from exc
    try:
        import numpy as np
    except ImportError as exc:  # pragma: no cover - 环境问题
        raise RuntimeError("需要 numpy 才能生成过程式数据：pip install numpy") from exc
    return Image, np


def _value_noise_2d(width: int, height: int, scale: int = 8, seed: int = 0) -> Any:
    """生成 2D value-noise（双线性插值的随机晶格）。

    返回 numpy float32 数组 shape=(height, width)，范围 [0, 1]。
    """
    _, np = _import_imaging()
    rng = np.random.default_rng(seed)
    # 低分辨率随机晶格
    lw = max(2, width // scale)
    lh = max(2, height // scale)
    lattice = rng.random((lh, lw), dtype=np.float32)
    # 双线性放大到目标尺寸
    ys = np.linspace(0, lh - 1, height, dtype=np.float32)
    xs = np.linspace(0, lw - 1, width, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, lh - 1)
    x1 = np.minimum(x0 + 1, lw - 1)
    fy = (ys - y0).reshape(-1, 1)
    fx = (xs - x0).reshape(1, -1)
    top = lattice[np.ix_(y0, x0)] * (1 - fx) + lattice[np.ix_(y0, x1)] * fx
    bot = lattice[np.ix_(y1, x0)] * (1 - fx) + lattice[np.ix_(y1, x1)] * fx
    out = top * (1 - fy) + bot * fy
    return out


def _rgb_from_channels(r: Any, g: Any, b: Any) -> Any:
    """将三个 [0,1] float 通道堆叠为 (H, W, 3) uint8。"""
    _, np = _import_imaging()
    arr = np.stack([r, g, b], axis=-1)
    arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
    return arr


def _save_png(arr: Any, path: str, quantize: bool = False) -> None:
    """保存 numpy uint8 数组为 PNG。

    参数：
        quantize: 若 True，将 RGB（3 通道）量化为 256 色调色板（P 模式），
                  大幅减小文件体积（适合天体纹理），代价是颜色精度略降。
                  RGBA（4 通道）不量化（PIL 调色板对 alpha 支持有限），
                  仅使用最高压缩级别。
    """
    Image, _ = _import_imaging()
    _ensure_dir(path)
    # 使用最高压缩级别 + Huffman 优化
    compress_kwargs: dict[str, Any] = {"compress_level": 9, "optimize": True}
    if arr.ndim == 2:
        Image.fromarray(arr, mode="L").save(path, **compress_kwargs)
    elif arr.shape[-1] == 3:
        img = Image.fromarray(arr, mode="RGB")
        if quantize:
            # 量化为 256 色调色板（MEDIANCUT 算法对摄影类图像效果较好）
            img = img.quantize(colors=256, method=Image.MEDIANCUT)
        img.save(path, **compress_kwargs)
    elif arr.shape[-1] == 4:
        # RGBA 不量化（PIL 调色板对 alpha 支持有限），仅用最高压缩
        Image.fromarray(arr, mode="RGBA").save(path, **compress_kwargs)
    else:
        raise ValueError(f"unsupported array shape {arr.shape}")


# ---- 各天体纹理生成 ----

def gen_sun_texture(width: int = 1024, height: int = 512) -> Any:
    """太阳表面：橙黄渐变 + 低频 value-noise 颗粒。

    使用较低频率噪声（scale=48）使 PNG 压缩后 < 100KB。
    """
    _, np = _import_imaging()
    # 单一低频噪声源，避免多频叠加产生高熵无法压缩的图案
    noise = _value_noise_2d(width, height, scale=48, seed=42)
    # 加一道经度方向的渐变带，模拟太阳赤道略亮
    xs = np.linspace(0, 1, width, dtype=np.float32).reshape(1, -1)
    band = 0.5 + 0.5 * np.sin(xs * 2 * math.pi)
    n = np.clip(0.6 * noise + 0.4 * band, 0, 1)
    # 橙到亮黄渐变
    r = 0.85 + 0.15 * n
    g = 0.45 + 0.45 * n
    b = 0.10 + 0.30 * n
    return _rgb_from_channels(r, g, b)


def gen_earth_texture(width: int = 1024, height: int = 512) -> Any:
    """地球：蓝海洋 + 绿/棕陆地（基于噪声阈值）。

    使用较低频率噪声（scale=32）使 PNG 压缩后 < 100KB。
    """
    _, np = _import_imaging()
    # 单一低频噪声源，构造大陆块状图案
    n = _value_noise_2d(width, height, scale=32, seed=7)
    # 极地白色
    lat = np.abs(np.linspace(-1, 1, height, dtype=np.float32)).reshape(-1, 1)
    polar = np.clip((lat - 0.75) * 4.0, 0, 1)
    ocean = (n < 0.48).astype(np.float32)
    land = 1.0 - ocean
    r = ocean * 0.10 + land * (0.25 + 0.35 * n) + polar * 0.7
    g = ocean * 0.25 + land * (0.40 + 0.30 * n) + polar * 0.7
    b = ocean * 0.55 + land * (0.15 + 0.15 * n) + polar * 0.8
    return _rgb_from_channels(r, g, b)


def gen_moon_texture(width: int = 512, height: int = 256) -> Any:
    """月球：灰阶噪声 + 玄武岩月海暗斑。"""
    _, np = _import_imaging()
    n = _value_noise_2d(width, height, scale=10, seed=11)
    n2 = _value_noise_2d(width, height, scale=4, seed=12)
    v = 0.5 + 0.3 * n + 0.1 * n2
    # 月海暗区
    maria = _value_noise_2d(width, height, scale=6, seed=13) < 0.35
    v = np.where(maria, v * 0.55, v)
    v = np.clip(v, 0, 1)
    return _rgb_from_channels(v, v, v)


def gen_mars_texture(width: int = 512, height: int = 256) -> Any:
    """火星：红橙渐变 + 极冠白点。"""
    _, np = _import_imaging()
    n = _value_noise_2d(width, height, scale=10, seed=21)
    n2 = _value_noise_2d(width, height, scale=4, seed=22) * 0.4
    v = n * 0.8 + n2
    lat = np.abs(np.linspace(-1, 1, height, dtype=np.float32)).reshape(-1, 1)
    polar = np.clip((lat - 0.82) * 6.0, 0, 1)
    r = 0.55 + 0.35 * v + polar * 0.4
    g = 0.20 + 0.20 * v + polar * 0.4
    b = 0.10 + 0.10 * v + polar * 0.5
    return _rgb_from_channels(r, g, b)


def gen_jupiter_texture(width: int = 512, height: int = 256) -> Any:
    """木星：水平带状云带 + 大红斑。"""
    _, np = _import_imaging()
    n = _value_noise_2d(width, height, scale=8, seed=31) * 0.3
    # 水平带：用 sin 函数生成条带
    ys = np.linspace(0, math.pi * 8, height, dtype=np.float32).reshape(-1, 1)
    band = (np.sin(ys) * 0.5 + 0.5)
    band = band + n
    r = 0.75 + 0.20 * band
    g = 0.55 + 0.25 * band
    b = 0.35 + 0.25 * band
    # 大红斑（椭圆暗区）
    cx, cy = width // 2, height // 3
    xs_arr = np.arange(width, dtype=np.float32).reshape(1, -1)
    ys_arr = np.arange(height, dtype=np.float32).reshape(-1, 1)
    dx = (xs_arr - cx) / (width * 0.12)
    dy = (ys_arr - cy) / (height * 0.18)
    spot = np.exp(-(dx * dx + dy * dy) * 2.0)
    r = r * (1 - spot * 0.6) + spot * 0.6
    g = g * (1 - spot * 0.7) + spot * 0.2
    b = b * (1 - spot * 0.8) + spot * 0.1
    return _rgb_from_channels(r, g, b)


# ---- 高程数据生成 ----

def gen_elevation(grid_w: int = 64, grid_h: int = 32, seed: int = 0,
                  base_range: tuple[float, float] = (-8000.0, 8000.0)) -> Any:
    """生成简化高程数据（float32, shape=(grid_h, grid_w)）。

    结合正弦波与 value-noise，模拟陆地/海洋起伏。
    返回 numpy float32 数组。
    """
    _, np = _import_imaging()
    rng = np.random.default_rng(seed)
    # 经纬度网格
    xs = np.linspace(0, 2 * math.pi, grid_w, dtype=np.float32)
    ys = np.linspace(0, math.pi, grid_h, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys)
    # 多频正弦叠加
    h = (np.sin(2 * X) * np.cos(3 * Y) * 0.4
         + np.sin(5 * X + 1.3) * np.sin(4 * Y) * 0.3
         + np.sin(7 * X) * np.cos(7 * Y) * 0.2)
    # 加随机噪声
    h = h + rng.random((grid_h, grid_w), dtype=np.float32) * 0.2 - 0.1
    # 归一化到指定范围
    h_min, h_max = float(h.min()), float(h.max())
    h_norm = (h - h_min) / (h_max - h_min + 1e-9)
    lo, hi = base_range
    return (lo + (hi - lo) * h_norm).astype(np.float32)


def gen_earth_elevation(grid_w: int = 64, grid_h: int = 32) -> Any:
    """地球高程：海陆分布（约 70% 海洋 0 以下）。"""
    _, np = _import_imaging()
    base = gen_elevation(grid_w, grid_h, seed=101, base_range=(-10000.0, 8848.0))
    # 海平面阈值（约 70% 在 0 以下）
    threshold = float(np.quantile(base, 0.70))
    return (base - threshold).astype(np.float32)


def gen_moon_elevation(grid_w: int = 64, grid_h: int = 32) -> Any:
    """月球高程：-9000 ~ +10000 m，月海低洼。"""
    return gen_elevation(grid_w, grid_h, seed=102, base_range=(-9000.0, 10000.0))


def gen_mars_elevation(grid_w: int = 64, grid_h: int = 32) -> Any:
    """火星高程：-8000 ~ +21000 m（含奥林匹斯山）。"""
    _, np = _import_imaging()
    base = gen_elevation(grid_w, grid_h, seed=103, base_range=(-8000.0, 18000.0))
    # 加一座"奥林匹斯山"
    cx, cy = grid_w // 4, grid_h // 2
    xs_arr = np.arange(grid_w, dtype=np.float32).reshape(1, -1)
    ys_arr = np.arange(grid_h, dtype=np.float32).reshape(-1, 1)
    dx = (xs_arr - cx) / (grid_w * 0.08)
    dy = (ys_arr - cy) / (grid_h * 0.08)
    olympus = np.exp(-(dx * dx + dy * dy) * 2.0) * 3000.0
    return (base + olympus).astype(np.float32)


# ---- 特效素材生成 ----

def gen_noise_256(width: int = 256, height: int = 256) -> Any:
    """256x256 灰度噪声图（多频 value-noise）。"""
    _, np = _import_imaging()
    n1 = _value_noise_2d(width, height, scale=4, seed=51)
    n2 = _value_noise_2d(width, height, scale=8, seed=52) * 0.5
    n3 = _value_noise_2d(width, height, scale=16, seed=53) * 0.25
    v = np.clip(n1 + n2 + n3, 0, 1)
    return (v * 255).astype(np.uint8)


def gen_corona_512(width: int = 512, height: int = 512) -> Any:
    """512x512 径向渐变（中心亮黄、外围透明黑）。"""
    _, np = _import_imaging()
    cx, cy = width / 2.0, height / 2.0
    xs_arr = np.arange(width, dtype=np.float32).reshape(1, -1)
    ys_arr = np.arange(height, dtype=np.float32).reshape(-1, 1)
    dx = (xs_arr - cx) / (width / 2.0)
    dy = (ys_arr - cy) / (height / 2.0)
    r = np.sqrt(dx * dx + dy * dy)
    # 中心亮 + 外围快速衰减
    intensity = np.clip(1.0 - r, 0, 1) ** 2
    # 加一些噪声扰动
    noise = _value_noise_2d(width, height, scale=8, seed=61) * 0.2
    intensity = np.clip(intensity + noise * (1 - r).clip(0, 1), 0, 1)
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = np.clip(intensity * 255, 0, 255).astype(np.uint8)
    rgba[..., 1] = np.clip(intensity * 200, 0, 255).astype(np.uint8)
    rgba[..., 2] = np.clip(intensity * 80, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(intensity * 220, 0, 255).astype(np.uint8)
    return rgba


def gen_star_field_1024(width: int = 1024, height: int = 512) -> Any:
    """1024x512 黑底白点星点图。"""
    _, np = _import_imaging()
    rng = np.random.default_rng(71)
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    # 大量暗星 + 少量亮星
    n_stars = 2500
    xs = rng.integers(0, width, size=n_stars)
    ys = rng.integers(0, height, size=n_stars)
    brightness = rng.random(n_stars) ** 2.5  # 多数暗，少数亮
    sizes = (brightness * 2.5).astype(np.int32) + 1
    for x, y, b, s in zip(xs, ys, brightness, sizes):
        v = int(b * 255)
        arr[y, x] = (v, v, v)
        # 亮星画十字光芒
        if b > 0.6:
            for dx in range(-s, s + 1):
                if 0 <= x + dx < width:
                    arr[y, x + dx] = (max(arr[y, x + dx, 0], v // 2),) * 3
            for dy in range(-s, s + 1):
                if 0 <= y + dy < height:
                    arr[y + dy, x] = (max(arr[y + dy, x, 0], v // 2),) * 3
    return arr


# ============================================================
# 过程式资产生成入口
# ============================================================

# 每个 asset id 对应的生成函数
_GENERATORS: dict[str, Any] = {
    "sun_texture": lambda spec: gen_sun_texture(spec["width"], spec["height"]),
    "earth_texture": lambda spec: gen_earth_texture(spec["width"], spec["height"]),
    "moon_texture": lambda spec: gen_moon_texture(spec["width"], spec["height"]),
    "mars_texture": lambda spec: gen_mars_texture(spec["width"], spec["height"]),
    "jupiter_texture": lambda spec: gen_jupiter_texture(spec["width"], spec["height"]),
    "earth_elevation": lambda spec: gen_earth_elevation(spec["grid_w"], spec["grid_h"]),
    "moon_elevation": lambda spec: gen_moon_elevation(spec["grid_w"], spec["grid_h"]),
    "mars_elevation": lambda spec: gen_mars_elevation(spec["grid_w"], spec["grid_h"]),
    "noise_256": lambda spec: gen_noise_256(spec["width"], spec["height"]),
    "corona_512": lambda spec: gen_corona_512(spec["width"], spec["height"]),
    "star_field_1024": lambda spec: gen_star_field_1024(spec["width"], spec["height"]),
}


def _write_elevation_bin(arr: Any, path: str) -> None:
    """将 float32 numpy 数组写入裸二进制文件。"""
    _ensure_dir(path)
    arr.astype("<f4").tofile(path)


def generate_procedural_asset(spec: dict[str, Any], root: str) -> str:
    """根据 spec 生成单个过程式资产文件，返回写入的绝对路径。"""
    aid = spec["id"]
    if aid not in _GENERATORS:
        raise ValueError(f"no generator for asset id: {aid}")
    arr = _GENERATORS[aid](spec)
    abs_path = os.path.join(root, spec["path"])
    _ensure_dir(abs_path)
    if spec["type"] == "elevation":
        _write_elevation_bin(arr, abs_path)
    else:
        # body 纹理（assets-src/bodies/*.png）需满足 < 100KB 约束，启用调色板量化
        # effects 纹理也量化以保持体积紧凑（corona_512 等 RGBA 图明显受益）
        quantize = spec["path"].startswith("assets-src/bodies/") or \
                   spec["path"].startswith("assets-src/effects/")
        _save_png(arr, abs_path, quantize=quantize)
    return abs_path


def generate_all_procedural(root: str, target: str = "all") -> list[str]:
    """生成全部（或某一类）过程式占位资产，返回写入文件绝对路径列表。"""
    written: list[str] = []
    for spec in ASSET_CATALOG:
        if target != "all" and not spec["path"].startswith(f"assets-src/{target}/"):
            continue
        path = generate_procedural_asset(spec, root)
        written.append(path)
        size = os.path.getsize(path)
        print(f"    生成 {os.path.relpath(path, root)} ({size} bytes)")
    return written


# ============================================================
# manifest 构建
# ============================================================

def build_manifest(root: str) -> dict[str, Any]:
    """扫描 ASSET_CATALOG 中已在磁盘上存在的资产，构建 manifest 对象。

    每条记录包含：
        id, name, type, path, layer, size_bytes, sha256,
        source_url, license, procedural

    分层统计 by_layer。
    """
    entries: list[dict[str, Any]] = []
    for spec in ASSET_CATALOG:
        abs_path = os.path.join(root, spec["path"])
        if not os.path.isfile(abs_path):
            continue
        size = os.path.getsize(abs_path)
        digest = _sha256(abs_path)
        entries.append({
            "id": spec["id"],
            "name": spec["name"],
            "type": spec["type"],
            "path": spec["path"],
            "layer": spec["layer"],
            "size_bytes": size,
            "sha256": digest,
            "source_url": spec["source_url"],
            "license": spec["license"],
            "procedural": spec.get("procedural", False),
        })

    by_layer: dict[str, int] = {}
    for e in entries:
        by_layer[e["layer"]] = by_layer.get(e["layer"], 0) + 1

    return {
        "schema": "solar-system-assets-manifest/v1",
        "version": "0.1.0",
        "generated": "procedural",
        "root": os.path.abspath(root),
        "layer_definition": {
            "S": "核心可见天体（太阳/地球/月球）—— 必须有纹理+高程",
            "A": "主要行星（火星/木星等）—— 至少有纹理",
            "B": "次要卫星（土卫六等）—— 占位即可",
            "C": "远景与特效（星空/噪声/corona）—— 不绑定具体天体",
        },
        "total_assets": len(entries),
        "total_size_bytes": sum(e["size_bytes"] for e in entries),
        "by_layer": by_layer,
        "assets": entries,
    }


def write_manifest(manifest: dict[str, Any], out_path: str) -> None:
    """将 manifest 写入 JSON 文件。"""
    _ensure_dir(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


# ============================================================
# CLI 入口
# ============================================================

def _filter_catalog(target: str) -> list[dict[str, Any]]:
    """按 target 过滤 ASSET_CATALOG。"""
    if target == "all":
        return list(ASSET_CATALOG)
    return [s for s in ASSET_CATALOG if s["path"].startswith(f"assets-src/{target}/")]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="assets-src 公开资产下载器与过程式占位生成器（修复 N-06 / E-31）",
    )
    parser.add_argument(
        "--target",
        choices=["bodies", "terrain", "effects", "all"],
        default="all",
        help="处理哪一类资产（默认 all）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅打印将要处理的资产清单，不写任何文件",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="真实下载 NASA/USGS 影像（默认关闭，使用过程式占位）",
    )
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="仅根据已存在资产重新生成 manifest.json",
    )
    parser.add_argument(
        "--root",
        default=DEFAULT_ROOT,
        help="项目根目录（默认：tools/asset-downloader 上两级）",
    )
    parser.add_argument(
        "--manifest-out",
        default=None,
        help=f"manifest 输出路径（默认：<root>/{DEFAULT_MANIFEST}）",
    )
    args = parser.parse_args(argv)

    root = os.path.abspath(args.root)
    manifest_out = os.path.abspath(args.manifest_out) if args.manifest_out \
        else os.path.join(root, DEFAULT_MANIFEST)

    selected = _filter_catalog(args.target)

    print(f"==> asset-downloader 启动（target={args.target}，dry_run={args.dry_run}，"
          f"download={args.download}，root={root}）")
    print(f"    待处理资产 {len(selected)} 项：")
    for spec in selected:
        flag = "[PROC]" if spec.get("procedural") else "[DL]"
        print(f"      {flag} {spec['layer']} {spec['id']:24s} -> {spec['path']}")
        print(f"            source: {spec['source_url']}")

    if args.dry_run:
        print("==> dry-run 模式：不写任何文件，退出")
        return 0

    if args.manifest_only:
        print("==> manifest-only 模式：跳过资产生成")
    else:
        if args.download:
            # 真实下载分支（默认不启用）
            print("==> 真实下载模式：尝试从 NASA/USGS 拉取远程文件")
            print("    注意：大文件下载耗时长且可能需要 NASA Earthdata 登录；")
            print("    若失败请改用默认过程式生成（去掉 --download）")
            for spec in selected:
                abs_path = os.path.join(root, spec["path"])
                try:
                    download_file(spec["source_url"], abs_path,
                                  expected_sha256=spec.get("expected_sha256"))
                    print(f"    下载成功 {spec['path']}")
                except Exception as exc:  # noqa: BLE001
                    print(f"    下载失败 {spec['path']}：{exc}，回退到过程式生成")
                    generate_procedural_asset(spec, root)
        else:
            print(f"==> 过程式生成 {len(selected)} 项资产到 assets-src/")
            generate_all_procedural(root, target=args.target)

    # 总是重新生成 manifest
    print("==> 构建 manifest.json")
    manifest = build_manifest(root)
    write_manifest(manifest, manifest_out)
    print(f"    manifest 已写出：{os.path.relpath(manifest_out, root)}")
    print(f"    总资产数：{manifest['total_assets']}")
    print(f"    总字节数：{manifest['total_size_bytes']}")
    for layer, count in sorted(manifest["by_layer"].items()):
        print(f"    {layer} 层：{count} 项")

    print("==> 完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
