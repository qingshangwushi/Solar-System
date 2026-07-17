"""tools/asset-downloader/test_manifest.py

manifest.json 完整性测试：验证 `assets-src/manifest.json` 的 JSON 合法性、
每个登记资产文件实际存在、SHA-256 匹配、S/A/B/C 分层覆盖。

与 test_download_assets.py 不同，本测试面向**已落盘的 manifest.json**，
用于在 CI 中确保 manifest 与资产文件保持同步。
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from typing import Any

import pytest

# 让测试能 import 同目录的 download_assets 模块
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import download_assets as da  # noqa: E402


# ============================================================
# 定位项目根目录与 manifest 路径
# ============================================================

PROJECT_ROOT = da.DEFAULT_ROOT
MANIFEST_PATH = os.path.join(PROJECT_ROOT, da.DEFAULT_MANIFEST)


# ============================================================
# pytest fixture：加载 manifest.json
# ============================================================

@pytest.fixture(scope="module")
def manifest() -> dict[str, Any]:
    """加载 assets-src/manifest.json。

    若文件不存在则 skip（用于尚未生成资产的环境）。
    """
    if not os.path.isfile(MANIFEST_PATH):
        pytest.skip(f"manifest.json 不存在：{MANIFEST_PATH}（请先运行 download_assets.py）")
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ============================================================
# manifest.json 合法性与结构测试
# ============================================================

class TestManifestStructure:

    def test_manifest_file_exists(self):
        """manifest.json 文件应存在。"""
        assert os.path.isfile(MANIFEST_PATH), \
            f"assets-src/manifest.json 不存在：{MANIFEST_PATH}"

    def test_manifest_is_valid_json(self, manifest):
        assert isinstance(manifest, dict)

    def test_schema_field(self, manifest):
        assert manifest["schema"] == "solar-system-assets-manifest/v1"

    def test_version_field(self, manifest):
        assert manifest["version"] == "0.1.0"

    def test_assets_is_list(self, manifest):
        assert isinstance(manifest["assets"], list)
        assert len(manifest["assets"]) > 0, "manifest assets 列表为空"

    def test_total_assets_matches(self, manifest):
        assert manifest["total_assets"] == len(manifest["assets"])

    def test_total_size_bytes_matches(self, manifest):
        expected = sum(a["size_bytes"] for a in manifest["assets"])
        assert manifest["total_size_bytes"] == expected

    def test_by_layer_matches(self, manifest):
        expected: dict[str, int] = {}
        for a in manifest["assets"]:
            expected[a["layer"]] = expected.get(a["layer"], 0) + 1
        assert manifest["by_layer"] == expected

    def test_layer_definition_present(self, manifest):
        ld = manifest.get("layer_definition", {})
        for layer in ("S", "A", "B", "C"):
            assert layer in ld, f"layer_definition 缺少 {layer}"


# ============================================================
# 每条 asset 记录字段完整性
# ============================================================

class TestAssetEntryFields:

    REQUIRED_FIELDS = {
        "id", "name", "type", "path", "layer",
        "size_bytes", "sha256", "source_url", "license",
    }

    def test_all_entries_have_required_fields(self, manifest):
        for a in manifest["assets"]:
            missing = self.REQUIRED_FIELDS - set(a.keys())
            assert not missing, f"{a.get('id')} 缺少字段: {missing}"

    def test_id_is_nonempty_string(self, manifest):
        for a in manifest["assets"]:
            assert isinstance(a["id"], str) and len(a["id"]) > 0

    def test_layer_in_sabc(self, manifest):
        valid = {"S", "A", "B", "C"}
        for a in manifest["assets"]:
            assert a["layer"] in valid, f"{a['id']} layer={a['layer']} 不合法"

    def test_type_is_valid(self, manifest):
        valid = {"texture", "elevation", "effect"}
        for a in manifest["assets"]:
            assert a["type"] in valid, f"{a['id']} type={a['type']} 不合法"

    def test_size_bytes_positive(self, manifest):
        for a in manifest["assets"]:
            assert a["size_bytes"] > 0, f"{a['id']} size_bytes={a['size_bytes']} 非正"

    def test_sha256_is_64_hex(self, manifest):
        for a in manifest["assets"]:
            sha = a["sha256"]
            assert len(sha) == 64, f"{a['id']} sha256 长度 {len(sha)} != 64"
            int(sha, 16)  # 应能解析为十六进制

    def test_source_url_is_http(self, manifest):
        for a in manifest["assets"]:
            url = a["source_url"]
            assert url.startswith("http://") or url.startswith("https://"), \
                f"{a['id']} source_url 非合法: {url}"

    def test_path_under_assets_src(self, manifest):
        for a in manifest["assets"]:
            assert a["path"].startswith("assets-src/"), \
                f"{a['id']} path={a['path']} 不在 assets-src/ 下"

    def test_unique_ids(self, manifest):
        ids = [a["id"] for a in manifest["assets"]]
        assert len(ids) == len(set(ids)), f"asset id 重复: {ids}"

    def test_unique_paths(self, manifest):
        paths = [a["path"] for a in manifest["assets"]]
        assert len(paths) == len(set(paths)), f"asset path 重复: {paths}"


# ============================================================
# 文件存在性与 SHA-256 校验
# ============================================================

class TestAssetFileIntegrity:

    def test_all_files_exist(self, manifest):
        for a in manifest["assets"]:
            abs_path = os.path.join(PROJECT_ROOT, a["path"])
            assert os.path.isfile(abs_path), \
                f"{a['id']} 文件不存在: {abs_path}"

    def test_all_sha256_match(self, manifest):
        for a in manifest["assets"]:
            abs_path = os.path.join(PROJECT_ROOT, a["path"])
            if not os.path.isfile(abs_path):
                continue  # 由上一个测试覆盖
            actual = da._sha256(abs_path)
            assert actual == a["sha256"], \
                f"{a['id']} SHA-256 不匹配：manifest={a['sha256']} 实际={actual}"

    def test_size_bytes_match_disk(self, manifest):
        for a in manifest["assets"]:
            abs_path = os.path.join(PROJECT_ROOT, a["path"])
            if not os.path.isfile(abs_path):
                continue
            actual = os.path.getsize(abs_path)
            assert actual == a["size_bytes"], \
                f"{a['id']} size_bytes 不匹配：manifest={a['size_bytes']} 实际={actual}"


# ============================================================
# 必要资产覆盖（N-06 / E-31）
# ============================================================

class TestRequiredAssetCoverage:

    REQUIRED_BODIES = {
        "assets-src/bodies/sun.png",
        "assets-src/bodies/earth.png",
        "assets-src/bodies/moon.png",
        "assets-src/bodies/mars.png",
        "assets-src/bodies/jupiter.png",
    }
    REQUIRED_TERRAIN = {
        "assets-src/terrain/earth_elevation.bin",
        "assets-src/terrain/moon_elevation.bin",
        "assets-src/terrain/mars_elevation.bin",
    }
    REQUIRED_EFFECTS = {
        "assets-src/effects/noise_256.png",
        "assets-src/effects/corona_512.png",
        "assets-src/effects/star_field_1024.png",
    }

    def test_required_body_textures_present(self, manifest):
        paths = {a["path"] for a in manifest["assets"]}
        missing = self.REQUIRED_BODIES - paths
        assert not missing, f"缺少必要 body 纹理: {missing}"

    def test_required_terrain_present(self, manifest):
        paths = {a["path"] for a in manifest["assets"]}
        missing = self.REQUIRED_TERRAIN - paths
        assert not missing, f"缺少必要 terrain 高程: {missing}"

    def test_required_effects_present(self, manifest):
        paths = {a["path"] for a in manifest["assets"]}
        missing = self.REQUIRED_EFFECTS - paths
        assert not missing, f"缺少必要 effects 素材: {missing}"

    def test_bodies_dir_has_real_files(self):
        """assets-src/bodies/ 应至少有 5 个真实文件（不仅 .gitkeep）。"""
        bodies_dir = os.path.join(PROJECT_ROOT, "assets-src", "bodies")
        files = [f for f in os.listdir(bodies_dir) if f != ".gitkeep" and not f.startswith(".")]
        assert len(files) >= 5, f"assets-src/bodies/ 仅 {len(files)} 个文件: {files}"

    def test_terrain_dir_has_real_files(self):
        bodies_dir = os.path.join(PROJECT_ROOT, "assets-src", "terrain")
        files = [f for f in os.listdir(bodies_dir) if f != ".gitkeep" and not f.startswith(".")]
        assert len(files) >= 3, f"assets-src/terrain/ 仅 {len(files)} 个文件: {files}"

    def test_effects_dir_has_real_files(self):
        bodies_dir = os.path.join(PROJECT_ROOT, "assets-src", "effects")
        files = [f for f in os.listdir(bodies_dir) if f != ".gitkeep" and not f.startswith(".")]
        assert len(files) >= 3, f"assets-src/effects/ 仅 {len(files)} 个文件: {files}"


# ============================================================
# S/A/B/C 分层覆盖（E-31）
# ============================================================

class TestLayerCoverage:

    def test_s_layer_covers_sun_earth_moon(self, manifest):
        """S 层应覆盖太阳/地球/月球的纹理 + 高程。"""
        s_assets = [a for a in manifest["assets"] if a["layer"] == "S"]
        s_paths = {a["path"] for a in s_assets}
        required_s = {
            "assets-src/bodies/sun.png",
            "assets-src/bodies/earth.png",
            "assets-src/bodies/moon.png",
            "assets-src/terrain/earth_elevation.bin",
            "assets-src/terrain/moon_elevation.bin",
        }
        missing = required_s - s_paths
        assert not missing, f"S 层缺少核心资产: {missing}"

    def test_a_layer_has_planets(self, manifest):
        """A 层应至少包含火星/木星纹理 + 火星高程。"""
        a_assets = [a for a in manifest["assets"] if a["layer"] == "A"]
        a_paths = {a["path"] for a in a_assets}
        required_a = {
            "assets-src/bodies/mars.png",
            "assets-src/bodies/jupiter.png",
            "assets-src/terrain/mars_elevation.bin",
        }
        missing = required_a - a_paths
        assert not missing, f"A 层缺少主要行星资产: {missing}"

    def test_c_layer_has_effects(self, manifest):
        """C 层应至少包含 noise / corona / star_field 三个特效。"""
        c_assets = [a for a in manifest["assets"] if a["layer"] == "C"]
        c_paths = {a["path"] for a in c_assets}
        required_c = {
            "assets-src/effects/noise_256.png",
            "assets-src/effects/corona_512.png",
            "assets-src/effects/star_field_1024.png",
        }
        missing = required_c - c_paths
        assert not missing, f"C 层缺少特效资产: {missing}"

    def test_at_least_three_layers_covered(self, manifest):
        """S/A/B/C 至少 S/A/C 三层有覆盖（B 为可选）。"""
        layers = {a["layer"] for a in manifest["assets"]}
        assert "S" in layers
        assert "A" in layers
        assert "C" in layers


# ============================================================
# 文件大小约束（spec 要求每个 body PNG < 100KB）
# ============================================================

class TestSizeConstraints:

    def test_body_textures_under_100kb(self, manifest):
        """spec 要求每个 body PNG < 100KB。"""
        for a in manifest["assets"]:
            if a["path"].startswith("assets-src/bodies/") and a["path"].endswith(".png"):
                assert a["size_bytes"] < 100 * 1024, \
                    f"{a['id']} size={a['size_bytes']} 超过 100KB"

    def test_elevation_bins_correct_size(self, manifest):
        """高程 .bin 文件应为 64*32*4 = 8192 字节。"""
        for a in manifest["assets"]:
            if a["type"] == "elevation":
                assert a["size_bytes"] == 64 * 32 * 4, \
                    f"{a['id']} size={a['size_bytes']} 不等于 64*32*4=8192"


# ============================================================
# PNG 文件头校验（防止生成空文件或非 PNG 内容）
# ============================================================

class TestPngFileHeaders:

    PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

    def test_body_pngs_have_valid_header(self, manifest):
        for a in manifest["assets"]:
            if a["path"].startswith("assets-src/bodies/") and a["path"].endswith(".png"):
                abs_path = os.path.join(PROJECT_ROOT, a["path"])
                with open(abs_path, "rb") as f:
                    head = f.read(8)
                assert head == self.PNG_MAGIC, \
                    f"{a['id']} PNG 头无效: {head!r}"

    def test_effect_pngs_have_valid_header(self, manifest):
        for a in manifest["assets"]:
            if a["path"].startswith("assets-src/effects/") and a["path"].endswith(".png"):
                abs_path = os.path.join(PROJECT_ROOT, a["path"])
                with open(abs_path, "rb") as f:
                    head = f.read(8)
                assert head == self.PNG_MAGIC, \
                    f"{a['id']} PNG 头无效: {head!r}"
