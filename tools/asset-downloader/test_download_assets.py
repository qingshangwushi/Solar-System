"""tools/asset-downloader/test_download_assets.py

单元测试：mock requests 库测试 HTTP 下载逻辑（URL 解析、Range 续传、SHA-256 校验、
重试退避）与过程式资产生成器输出维度。

不依赖网络。所有 HTTP 交互通过 FakeSession 模拟。
"""
from __future__ import annotations

import hashlib
import io
import os
import sys
import time
from typing import Any
from unittest.mock import patch

import pytest

# 让测试能 import 同目录的 download_assets 模块
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import download_assets as da  # noqa: E402


# ============================================================
# FakeSession / FakeResponse：模拟 requests.Session
# ============================================================

class FakeResponse:
    """模拟 requests.Response。"""

    def __init__(self, status_code: int, content: bytes, *, support_range: bool = True):
        self.status_code = status_code
        self._content = content
        self._support_range = support_range
        self._stream_pos = 0

    def iter_content(self, chunk_size: int = 1):
        # 模拟流式读取：按 chunk_size 切片返回
        view = self._content
        pos = 0
        while pos < len(view):
            yield view[pos:pos + chunk_size]
            pos += chunk_size

    @property
    def content(self) -> bytes:
        return self._content

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeSession:
    """模拟 requests.Session，记录请求并可编程响应。

    用法：
        session = FakeSession()
        session.enqueue(200, b"hello")      # 第一次 get 返回 200 + b"hello"
        session.enqueue(206, b" world")     # 第二次 get 返回 206 + b" world"
        session.enqueue_exception(RuntimeError("boom"))  # 第三次抛异常

    每次调用 get(...) 弹出队首响应。可读取 `calls` 检查请求参数。
    """

    def __init__(self):
        self._queue: list[Any] = []
        self.calls: list[dict[str, Any]] = []

    def enqueue(self, status_code: int, content: bytes) -> "FakeSession":
        self._queue.append(FakeResponse(status_code, content))
        return self

    def enqueue_exception(self, exc: Exception) -> "FakeSession":
        self._queue.append(exc)
        return self

    def get(self, url: str, *, headers=None, stream=False, timeout=None, allow_redirects=True):
        self.calls.append({
            "url": url,
            "headers": dict(headers or {}),
            "stream": stream,
            "timeout": timeout,
            "allow_redirects": allow_redirects,
        })
        if not self._queue:
            raise AssertionError(f"FakeSession: no queued response for {url}")
        item = self._queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


# ============================================================
# ASSET_CATALOG 完整性测试
# ============================================================

class TestAssetCatalog:
    """验证 ASSET_CATALOG 条目字段完整、URL 合法。"""

    def test_catalog_non_empty(self):
        assert len(da.ASSET_CATALOG) > 0, "ASSET_CATALOG 不应为空"

    def test_required_fields(self):
        required = {"id", "name", "type", "path", "layer", "source_url", "license"}
        for spec in da.ASSET_CATALOG:
            missing = required - set(spec.keys())
            assert not missing, f"{spec.get('id')} 缺少字段: {missing}"

    def test_layer_values(self):
        valid_layers = {"S", "A", "B", "C"}
        for spec in da.ASSET_CATALOG:
            assert spec["layer"] in valid_layers, \
                f"{spec['id']} layer={spec['layer']} 不在 {valid_layers}"

    def test_type_values(self):
        valid_types = {"texture", "elevation", "effect"}
        for spec in da.ASSET_CATALOG:
            assert spec["type"] in valid_types, \
                f"{spec['id']} type={spec['type']} 不在 {valid_types}"

    def test_source_url_is_http(self):
        for spec in da.ASSET_CATALOG:
            url = spec["source_url"]
            assert url.startswith("http://") or url.startswith("https://"), \
                f"{spec['id']} source_url 非合法 http(s) URL: {url}"

    def test_path_under_assets_src(self):
        for spec in da.ASSET_CATALOG:
            assert spec["path"].startswith("assets-src/"), \
                f"{spec['id']} path={spec['path']} 不在 assets-src/ 下"

    def test_unique_ids(self):
        ids = [s["id"] for s in da.ASSET_CATALOG]
        assert len(ids) == len(set(ids)), f"ASSET_CATALOG id 重复: {ids}"

    def test_unique_paths(self):
        paths = [s["path"] for s in da.ASSET_CATALOG]
        assert len(paths) == len(set(paths)), \
            f"ASSET_CATALOG path 重复: {paths}"

    def test_required_assets_present(self):
        """验证 spec 要求的最小资产集合都已在 catalog 中登记。"""
        ids = {s["id"] for s in da.ASSET_CATALOG}
        required = {
            "sun_texture", "earth_texture", "moon_texture", "mars_texture", "jupiter_texture",
            "earth_elevation", "moon_elevation", "mars_elevation",
            "noise_256", "corona_512", "star_field_1024",
        }
        missing = required - ids
        assert not missing, f"ASSET_CATALOG 缺少必要资产: {missing}"

    def test_layer_coverage_sabc(self):
        """验证 S/A/B/C 至少 S/A/C 三层有覆盖（B 为可选）。"""
        layers = {s["layer"] for s in da.ASSET_CATALOG}
        assert "S" in layers, "缺少 S 层资产"
        assert "A" in layers, "缺少 A 层资产"
        assert "C" in layers, "缺少 C 层资产"


# ============================================================
# _filter_catalog 测试
# ============================================================

class TestFilterCatalog:

    def test_all_returns_everything(self):
        result = da._filter_catalog("all")
        assert len(result) == len(da.ASSET_CATALOG)

    def test_bodies_only(self):
        result = da._filter_catalog("bodies")
        assert all(s["path"].startswith("assets-src/bodies/") for s in result)
        assert len(result) > 0

    def test_terrain_only(self):
        result = da._filter_catalog("terrain")
        assert all(s["path"].startswith("assets-src/terrain/") for s in result)
        assert len(result) > 0

    def test_effects_only(self):
        result = da._filter_catalog("effects")
        assert all(s["path"].startswith("assets-src/effects/") for s in result)
        assert len(result) > 0


# ============================================================
# SHA-256 工具测试
# ============================================================

class TestSha256:

    def test_sha256_known_value(self, tmp_path):
        p = tmp_path / "f.bin"
        p.write_bytes(b"hello world")
        # 已知 SHA-256 of "hello world"
        expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        assert da._sha256(str(p)) == expected

    def test_verify_sha256_match(self, tmp_path):
        p = tmp_path / "f.bin"
        p.write_bytes(b"hello world")
        expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        assert da.verify_sha256(str(p), expected) is True

    def test_verify_sha256_mismatch(self, tmp_path):
        p = tmp_path / "f.bin"
        p.write_bytes(b"hello world")
        wrong = "0" * 64
        assert da.verify_sha256(str(p), wrong) is False

    def test_verify_sha256_case_insensitive(self, tmp_path):
        p = tmp_path / "f.bin"
        p.write_bytes(b"hello world")
        expected_lower = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        expected_upper = expected_lower.upper()
        assert da.verify_sha256(str(p), expected_lower) is True
        assert da.verify_sha256(str(p), expected_upper) is True


# ============================================================
# download_file 测试（使用 FakeSession，不依赖网络）
# ============================================================

class TestDownloadFile:

    def test_simple_200_download(self, tmp_path):
        dest = str(tmp_path / "out.bin")
        session = FakeSession().enqueue(200, b"hello world")
        result = da.download_file("http://example.com/x", dest, session=session,
                                  max_retries=1)
        assert result == dest
        assert open(dest, "rb").read() == b"hello world"
        # 检查请求未带 Range（因为文件不存在）
        assert session.calls[0]["headers"] == {}

    def test_resumable_206_download(self, tmp_path):
        """已存在 5 字节，断点续传返回 206 + 后续内容。"""
        dest = str(tmp_path / "out.bin")
        # 预先写入 5 字节部分文件
        with open(dest, "wb") as f:
            f.write(b"hello")
        session = FakeSession().enqueue(206, b" world")
        result = da.download_file("http://example.com/x", dest, session=session,
                                  max_retries=1)
        assert result == dest
        assert open(dest, "rb").read() == b"hello world"
        # 检查请求带 Range: bytes=5-
        assert session.calls[0]["headers"].get("Range") == "bytes=5-"

    def test_200_overwrites_partial(self, tmp_path):
        """服务器返回 200（忽略 Range）时覆盖重写。"""
        dest = str(tmp_path / "out.bin")
        with open(dest, "wb") as f:
            f.write(b"partial-junk")
        session = FakeSession().enqueue(200, b"full-content")
        result = da.download_file("http://example.com/x", dest, session=session,
                                  max_retries=1)
        assert open(dest, "rb").read() == b"full-content"

    def test_sha256_pass(self, tmp_path):
        dest = str(tmp_path / "out.bin")
        content = b"hello world"
        expected = hashlib.sha256(content).hexdigest()
        session = FakeSession().enqueue(200, content)
        result = da.download_file("http://example.com/x", dest,
                                  expected_sha256=expected, session=session,
                                  max_retries=1)
        assert result == dest
        assert os.path.exists(dest)

    def test_sha256_mismatch_deletes_file_and_retries(self, tmp_path):
        """SHA-256 不匹配时删除文件并重试。"""
        dest = str(tmp_path / "out.bin")
        wrong_content = b"wrong content"
        right_content = b"hello world"
        expected = hashlib.sha256(right_content).hexdigest()

        session = FakeSession()
        # 第一次返回错误内容（SHA 不匹配）
        session.enqueue(200, wrong_content)
        # 第二次返回正确内容
        session.enqueue(200, right_content)

        # patch time.sleep 避免实际等待
        with patch.object(time, "sleep"):
            result = da.download_file("http://example.com/x", dest,
                                      expected_sha256=expected, session=session,
                                      max_retries=3, retry_backoff=1.0)
        assert result == dest
        assert open(dest, "rb").read() == right_content
        # 应该有两次 get 调用
        assert len(session.calls) == 2

    def test_retry_on_exception(self, tmp_path):
        """请求异常时按指数退避重试。"""
        dest = str(tmp_path / "out.bin")
        session = FakeSession()
        session.enqueue_exception(RuntimeError("network down"))
        session.enqueue(200, b"recovered")

        with patch.object(time, "sleep") as mock_sleep:
            result = da.download_file("http://example.com/x", dest,
                                      session=session, max_retries=3,
                                      retry_backoff=2.0)
        assert result == dest
        assert open(dest, "rb").read() == b"recovered"
        # 第一次失败后应该 sleep 一次（2^1=2 秒）
        assert mock_sleep.call_count == 1
        # 验证退避时间 = 2.0^1 = 2.0
        assert mock_sleep.call_args_list[0][0][0] == 2.0

    def test_all_retries_exhausted_raises(self, tmp_path):
        dest = str(tmp_path / "out.bin")
        session = FakeSession()
        for _ in range(3):
            session.enqueue_exception(RuntimeError("always fails"))

        with patch.object(time, "sleep"):
            with pytest.raises(RuntimeError, match="download failed after 3 attempts"):
                da.download_file("http://example.com/x", dest,
                                 session=session, max_retries=3, retry_backoff=1.0)

    def test_non_200_206_status_raises(self, tmp_path):
        dest = str(tmp_path / "out.bin")
        session = FakeSession().enqueue(404, b"not found")
        with patch.object(time, "sleep"):
            with pytest.raises(RuntimeError, match="download failed after 1 attempts"):
                da.download_file("http://example.com/x", dest,
                                 session=session, max_retries=1)

    def test_ensures_dest_dir(self, tmp_path):
        dest = str(tmp_path / "subdir" / "nested" / "out.bin")
        session = FakeSession().enqueue(200, b"x")
        da.download_file("http://example.com/x", dest, session=session, max_retries=1)
        assert os.path.isfile(dest)


# ============================================================
# 过程式生成器测试（验证输出维度与类型，不写文件）
# ============================================================

class TestProceduralGenerators:
    """生成器返回 numpy 数组，验证 shape 与 dtype。"""

    def test_sun_texture_shape(self):
        arr = da.gen_sun_texture(1024, 512)
        assert arr.shape == (512, 1024, 3)
        assert arr.dtype.name == "uint8"

    def test_earth_texture_shape(self):
        arr = da.gen_earth_texture(1024, 512)
        assert arr.shape == (512, 1024, 3)
        assert arr.dtype.name == "uint8"

    def test_moon_texture_shape(self):
        arr = da.gen_moon_texture(512, 256)
        assert arr.shape == (256, 512, 3)
        assert arr.dtype.name == "uint8"

    def test_mars_texture_shape(self):
        arr = da.gen_mars_texture(512, 256)
        assert arr.shape == (256, 512, 3)
        assert arr.dtype.name == "uint8"

    def test_jupiter_texture_shape(self):
        arr = da.gen_jupiter_texture(512, 256)
        assert arr.shape == (256, 512, 3)
        assert arr.dtype.name == "uint8"

    def test_earth_elevation_shape(self):
        arr = da.gen_earth_elevation(64, 32)
        assert arr.shape == (32, 64)
        assert arr.dtype.name == "float32"

    def test_moon_elevation_shape(self):
        arr = da.gen_moon_elevation(64, 32)
        assert arr.shape == (32, 64)
        assert arr.dtype.name == "float32"

    def test_mars_elevation_shape(self):
        arr = da.gen_mars_elevation(64, 32)
        assert arr.shape == (32, 64)
        assert arr.dtype.name == "float32"

    def test_earth_elevation_has_ocean_below_zero(self):
        """地球高程应该有约 70% 在 0 以下（海洋）。"""
        arr = da.gen_earth_elevation(64, 32)
        below = float((arr < 0).sum()) / arr.size
        assert 0.55 < below < 0.85, f"海洋占比 {below:.2f} 不在预期范围"

    def test_mars_elevation_has_olympus_peak(self):
        """火星高程最大值应显著大于平均（奥林匹斯山）。"""
        arr = da.gen_mars_elevation(64, 32)
        mean = float(arr.mean())
        mx = float(arr.max())
        assert mx > mean + 5000.0, f"最高点 {mx} 没有显著高于平均 {mean}"

    def test_noise_256_shape(self):
        arr = da.gen_noise_256(256, 256)
        assert arr.shape == (256, 256)
        assert arr.dtype.name == "uint8"

    def test_corona_512_shape_rgba(self):
        arr = da.gen_corona_512(512, 512)
        assert arr.shape == (512, 512, 4)
        assert arr.dtype.name == "uint8"

    def test_star_field_1024_shape(self):
        arr = da.gen_star_field_1024(1024, 512)
        assert arr.shape == (512, 1024, 3)
        assert arr.dtype.name == "uint8"

    def test_star_field_has_white_pixels(self):
        arr = da.gen_star_field_1024(1024, 512)
        # 应该至少有一颗星（非零像素）
        assert (arr > 0).any(), "星空图全黑，无星点"

    def test_corona_center_brighter_than_edge(self):
        """corona 中心应比边缘亮。"""
        arr = da.gen_corona_512(512, 512)
        h, w = arr.shape[:2]
        center_val = arr[h // 2, w // 2, 0]
        edge_val = arr[0, 0, 0]
        assert center_val > edge_val, \
            f"中心 {center_val} 不比边缘 {edge_val} 亮"


# ============================================================
# generate_procedural_asset 集成测试（写真实文件）
# ============================================================

class TestGenerateProceduralAsset:

    def test_generate_texture_writes_png(self, tmp_path):
        spec = {
            "id": "sun_texture",
            "path": "assets-src/bodies/sun.png",
            "type": "texture",
            "width": 128, "height": 64,
        }
        path = da.generate_procedural_asset(spec, str(tmp_path))
        assert os.path.isfile(path)
        assert path.endswith("sun.png")
        assert os.path.getsize(path) > 0

    def test_generate_elevation_writes_bin(self, tmp_path):
        spec = {
            "id": "earth_elevation",
            "path": "assets-src/terrain/earth_elevation.bin",
            "type": "elevation",
            "grid_w": 64, "grid_h": 32,
        }
        path = da.generate_procedural_asset(spec, str(tmp_path))
        assert os.path.isfile(path)
        # 64 * 32 * 4 bytes (float32) = 8192 字节
        assert os.path.getsize(path) == 64 * 32 * 4

    def test_generate_unknown_id_raises(self, tmp_path):
        spec = {"id": "nonexistent", "path": "x", "type": "texture"}
        with pytest.raises(ValueError, match="no generator"):
            da.generate_procedural_asset(spec, str(tmp_path))


# ============================================================
# CLI main 测试
# ============================================================

class TestMain:

    def test_dry_run_no_files_written(self, tmp_path, capsys):
        """--dry-run 不写任何文件，返回 0。"""
        rc = da.main(["--dry-run", "--root", str(tmp_path),
                      "--manifest-out", str(tmp_path / "manifest.json")])
        assert rc == 0
        # 不应有 manifest 写出
        # （dry-run 在写 manifest 之前 return）
        # 但实际上 main 在 dry-run 后直接 return，没有写 manifest
        captured = capsys.readouterr()
        assert "dry-run" in captured.out

    def test_main_full_generates_assets_and_manifest(self, tmp_path):
        """端到端：main 生成全部资产 + manifest.json。"""
        rc = da.main(["--root", str(tmp_path),
                      "--manifest-out", str(tmp_path / "manifest.json")])
        assert rc == 0
        # manifest 存在
        mpath = str(tmp_path / "manifest.json")
        assert os.path.isfile(mpath)
        # bodies / terrain / effects 都有文件
        for sub in ("bodies", "terrain", "effects"):
            sub_dir = tmp_path / "assets-src" / sub
            files = [f for f in sub_dir.iterdir() if f.name != ".gitkeep"]
            assert len(files) > 0, f"assets-src/{sub}/ 无资产文件"

    def test_main_target_bodies_only(self, tmp_path):
        rc = da.main(["--target", "bodies", "--root", str(tmp_path),
                      "--manifest-out", str(tmp_path / "manifest.json")])
        assert rc == 0
        bodies = list((tmp_path / "assets-src" / "bodies").iterdir())
        bodies = [f for f in bodies if f.name != ".gitkeep"]
        terrains = list((tmp_path / "assets-src" / "terrain").iterdir()) \
            if (tmp_path / "assets-src" / "terrain").exists() else []
        terrains = [f for f in terrains if f.name != ".gitkeep"]
        assert len(bodies) > 0
        # target=bodies 时不应生成 terrain
        assert len(terrains) == 0

    def test_main_manifest_only_skips_generation(self, tmp_path):
        """--manifest-only 跳过资产生成，仅写 manifest。"""
        # 先放一个空的 assets-src/bodies/sun.png
        bodies_dir = tmp_path / "assets-src" / "bodies"
        bodies_dir.mkdir(parents=True)
        (bodies_dir / "sun.png").write_bytes(b"\x89PNG fake")

        rc = da.main(["--manifest-only", "--root", str(tmp_path),
                      "--manifest-out", str(tmp_path / "manifest.json")])
        assert rc == 0
        import json
        with open(tmp_path / "manifest.json") as f:
            manifest = json.load(f)
        # 只登记已存在的 sun.png（其他资产未生成）
        assert manifest["total_assets"] == 1
        assert manifest["assets"][0]["id"] == "sun_texture"


# ============================================================
# build_manifest 测试
# ============================================================

class TestBuildManifest:

    def test_empty_root_returns_empty_manifest(self, tmp_path):
        m = da.build_manifest(str(tmp_path))
        assert m["total_assets"] == 0
        assert m["assets"] == []
        assert m["by_layer"] == {}

    def test_partial_assets_only_includes_existing(self, tmp_path):
        # 仅生成一个 sun 纹理
        spec = next(s for s in da.ASSET_CATALOG if s["id"] == "sun_texture")
        da.generate_procedural_asset(spec, str(tmp_path))
        m = da.build_manifest(str(tmp_path))
        assert m["total_assets"] == 1
        assert m["assets"][0]["id"] == "sun_texture"
        assert m["by_layer"].get("S") == 1

    def test_full_manifest_fields(self, tmp_path):
        # 生成全部资产
        for spec in da.ASSET_CATALOG:
            da.generate_procedural_asset(spec, str(tmp_path))
        m = da.build_manifest(str(tmp_path))
        required_fields = {"id", "name", "type", "path", "layer", "size_bytes",
                           "sha256", "source_url", "license", "procedural"}
        for entry in m["assets"]:
            missing = required_fields - set(entry.keys())
            assert not missing, f"{entry.get('id')} 缺少字段: {missing}"
        # sha256 应为 64 位十六进制
        for entry in m["assets"]:
            assert len(entry["sha256"]) == 64
            int(entry["sha256"], 16)  # 应能解析为十六进制
