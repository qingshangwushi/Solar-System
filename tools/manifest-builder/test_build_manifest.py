"""build_manifest.py 单元测试（Task 17.3 / 修复 R-08 补充项）。

覆盖：
- _sha256：分块 SHA-256 计算正确性
- _infer_dependencies：按目录前缀推断依赖
- _walk_root：递归扫描目录、跳过占位文件
- build_manifest：完整 manifest 生成（字段完整性：path/size/sha256/dependencies）
- 目录扫描完整性
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path

import pytest

# ============================================================
# 通过 importlib 加载 build_manifest 模块
# ============================================================
_THIS_DIR = Path(__file__).resolve().parent
_MODULE_PATH = _THIS_DIR / "build_manifest.py"

_spec = importlib.util.spec_from_file_location("build_manifest", str(_MODULE_PATH))
assert _spec is not None and _spec.loader is not None
bm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bm)


# ============================================================
# Fixtures：在临时目录中构造模拟项目结构
# ============================================================

@pytest.fixture
def fake_project(tmp_path: Path) -> Path:
    """构造模拟项目根目录：
    tmp_project/
      data-src/normalized/
        catalog.json        (内容: {"v":1})
        ephemeris-3.bin      (内容: 二进制)
      assets-src/bodies/
        earth.jpg           (内容: 1KB)
        .gitkeep            (占位，应被跳过)
      assets-src/effects/
        aurora.png          (内容: 2KB)
    """
    root = tmp_path / "tmp_project"
    (root / "data-src" / "normalized").mkdir(parents=True)
    (root / "assets-src" / "bodies").mkdir(parents=True)
    (root / "assets-src" / "effects").mkdir(parents=True)

    (root / "data-src" / "normalized" / "catalog.json").write_text('{"v":1}', encoding="utf-8")
    (root / "data-src" / "normalized" / "ephemeris-3.bin").write_bytes(b"\x00\x01\x02\x03")

    (root / "assets-src" / "bodies" / "earth.jpg").write_bytes(b"\xff" * 1024)
    (root / "assets-src" / "bodies" / ".gitkeep").write_text("", encoding="utf-8")
    (root / "assets-src" / "effects" / "aurora.png").write_bytes(b"\xaa" * 2048)

    return root


# ============================================================
# 1. _sha256
# ============================================================

def test_sha256_matches_hashlib(tmp_path: Path) -> None:
    """_sha256 应与 hashlib.sha256 直接计算结果一致。"""
    f = tmp_path / "data.bin"
    content = b"hello world\n" * 1000
    f.write_bytes(content)
    expected = hashlib.sha256(content).hexdigest()
    assert bm._sha256(str(f)) == expected
    assert len(bm._sha256(str(f))) == 64


def test_sha256_chunked_large_file(tmp_path: Path) -> None:
    """分块读取应能正确处理大于 chunk_size 的文件。"""
    f = tmp_path / "big.bin"
    # 内容跨多个 1MB 块
    content = b"abcdefgh" * (300 * 1024)  # ~2.4 MB
    f.write_bytes(content)
    expected = hashlib.sha256(content).hexdigest()
    assert bm._sha256(str(f), chunk_size=1024) == expected


def test_sha256_empty_file(tmp_path: Path) -> None:
    """空文件的 SHA-256 应等于 hashlib 对空内容的摘要。"""
    f = tmp_path / "empty.bin"
    f.write_bytes(b"")
    expected = hashlib.sha256(b"").hexdigest()
    assert bm._sha256(str(f)) == expected


# ============================================================
# 2. _infer_dependencies
# ============================================================

def test_infer_dependencies_bodies_depends_on_catalog() -> None:
    """assets-src/bodies/* 应依赖 catalog.json。"""
    deps = bm._infer_dependencies("assets-src/bodies/earth.jpg")
    assert deps == ["data-src/normalized/catalog.json"]


def test_infer_dependencies_terrain_depends_on_ephemeris() -> None:
    """assets-src/terrain/* 应依赖 ephemeris 目录。"""
    deps = bm._infer_dependencies("assets-src/terrain/moon.heightmap")
    assert deps == ["data-src/normalized/ephemeris"]


def test_infer_dependencies_effects_no_deps() -> None:
    """assets-src/effects/* 应无依赖。"""
    deps = bm._infer_dependencies("assets-src/effects/aurora.png")
    assert deps == []


def test_infer_dependencies_normalized_no_deps() -> None:
    """data-src/normalized/* 应无依赖。"""
    deps = bm._infer_dependencies("data-src/normalized/catalog.json")
    assert deps == []


def test_infer_dependencies_unknown_prefix() -> None:
    """未匹配任何规则时返回空列表。"""
    deps = bm._infer_dependencies("release/manifests/manifest.json")
    assert deps == []


# ============================================================
# 3. _walk_root
# ============================================================

def test_walk_root_skips_gitkeep(fake_project: Path) -> None:
    """_walk_root 应跳过 .gitkeep 等占位文件。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    paths = [e["path"] for e in entries]
    assert not any(".gitkeep" in p for p in paths), ".gitkeep 应被跳过"
    assert not any(".DS_Store" in p for p in paths)


def test_walk_root_includes_all_real_files(fake_project: Path) -> None:
    """_walk_root 应扫描到全部真实文件。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    paths = {e["path"] for e in entries}
    expected = {
        "data-src/normalized/catalog.json",
        "data-src/normalized/ephemeris-3.bin",
        "assets-src/bodies/earth.jpg",
        "assets-src/effects/aurora.png",
    }
    assert expected.issubset(paths), f"缺失文件: {expected - paths}"


def test_walk_root_entry_fields_complete(fake_project: Path) -> None:
    """每条 manifest 记录应包含 path/size/sha256/dependencies 完整字段。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    for entry in entries:
        assert "path" in entry
        assert "size" in entry
        assert "sha256" in entry
        assert "dependencies" in entry
        assert isinstance(entry["path"], str)
        assert isinstance(entry["size"], int)
        assert isinstance(entry["sha256"], str)
        assert len(entry["sha256"]) == 64
        assert isinstance(entry["dependencies"], list)


def test_walk_root_size_correct(fake_project: Path) -> None:
    """size 字段应等于文件实际字节数。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    by_path = {e["path"]: e for e in entries}
    assert by_path["data-src/normalized/catalog.json"]["size"] == len('{"v":1}')
    assert by_path["data-src/normalized/ephemeris-3.bin"]["size"] == 4
    assert by_path["assets-src/bodies/earth.jpg"]["size"] == 1024
    assert by_path["assets-src/effects/aurora.png"]["size"] == 2048


def test_walk_root_sha256_correct(fake_project: Path) -> None:
    """sha256 字段应等于文件内容的 SHA-256。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    by_path = {e["path"]: e for e in entries}
    earth_sha = hashlib.sha256(b"\xff" * 1024).hexdigest()
    aurora_sha = hashlib.sha256(b"\xaa" * 2048).hexdigest()
    assert by_path["assets-src/bodies/earth.jpg"]["sha256"] == earth_sha
    assert by_path["assets-src/effects/aurora.png"]["sha256"] == aurora_sha


def test_walk_root_dependencies_correct(fake_project: Path) -> None:
    """dependencies 字段应正确按目录前缀推断。"""
    entries = bm._walk_root(str(fake_project), bm.DEFAULT_SCAN_DIRS)
    by_path = {e["path"]: e for e in entries}
    assert by_path["assets-src/bodies/earth.jpg"]["dependencies"] == \
        ["data-src/normalized/catalog.json"]
    assert by_path["assets-src/effects/aurora.png"]["dependencies"] == []
    assert by_path["data-src/normalized/catalog.json"]["dependencies"] == []


def test_walk_root_skips_nonexistent_subdir(fake_project: Path) -> None:
    """指定不存在的子目录时应跳过而不抛异常。"""
    entries = bm._walk_root(str(fake_project), ("data-src/normalized", "does-not-exist"))
    assert len(entries) == 2  # catalog.json + ephemeris-3.bin


# ============================================================
# 4. build_manifest
# ============================================================

def test_build_manifest_top_level_fields(fake_project: Path) -> None:
    """build_manifest 应输出完整顶层字段。"""
    manifest = bm.build_manifest(str(fake_project))
    assert manifest["schema"] == "solar-system-manifest/v1"
    assert manifest["version"] == "0.1.0"
    assert manifest["generated"] == "smoke"
    assert "root" in manifest and os.path.isabs(manifest["root"])
    assert manifest["scan_dirs"] == list(bm.DEFAULT_SCAN_DIRS)
    assert "total_files" in manifest
    assert "total_size" in manifest
    assert "by_top_level" in manifest
    assert "entries" in manifest


def test_build_manifest_total_files_consistent(fake_project: Path) -> None:
    """total_files 应等于 entries 长度。"""
    manifest = bm.build_manifest(str(fake_project))
    assert manifest["total_files"] == len(manifest["entries"])


def test_build_manifest_total_size_sum(fake_project: Path) -> None:
    """total_size 应等于所有 entries size 之和。"""
    manifest = bm.build_manifest(str(fake_project))
    expected = sum(e["size"] for e in manifest["entries"])
    assert manifest["total_size"] == expected


def test_build_manifest_by_top_level(fake_project: Path) -> None:
    """by_top_level 应按路径首段分组计数。"""
    manifest = bm.build_manifest(str(fake_project))
    by_top = manifest["by_top_level"]
    # data-src 与 assets-src 各至少 1 文件
    assert by_top.get("data-src", 0) >= 2
    assert by_top.get("assets-src", 0) >= 2


def test_build_manifest_custom_scan_dirs(fake_project: Path) -> None:
    """build_manifest 应支持自定义 scan_subdirs。"""
    manifest = bm.build_manifest(str(fake_project), scan_subdirs=("data-src/normalized",))
    # 仅扫描 data-src/normalized，应得 2 个文件
    assert manifest["total_files"] == 2
    paths = {e["path"] for e in manifest["entries"]}
    assert paths == {
        "data-src/normalized/catalog.json",
        "data-src/normalized/ephemeris-3.bin",
    }
    assert manifest["scan_dirs"] == ["data-src/normalized"]


def test_build_manifest_empty_root(tmp_path: Path) -> None:
    """空根目录应返回 0 文件且不抛异常。"""
    empty_root = tmp_path / "empty"
    empty_root.mkdir()
    manifest = bm.build_manifest(str(empty_root), ("data-src/normalized",))
    assert manifest["total_files"] == 0
    assert manifest["entries"] == []
    assert manifest["total_size"] == 0


def test_build_manifest_paths_use_forward_slash(fake_project: Path) -> None:
    """path 字段应使用正斜杠（跨平台约定），即使在 macOS/Linux 也应规范化。"""
    manifest = bm.build_manifest(str(fake_project))
    for entry in manifest["entries"]:
        assert "\\" not in entry["path"], f"path 含反斜杠: {entry['path']}"
