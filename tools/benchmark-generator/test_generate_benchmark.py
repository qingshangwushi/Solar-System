"""generate_benchmark.py 单元测试（Task 17.5 / 修复 R-08 补充项）。

覆盖：
- _build_scene：单场景定义构建
- build_benchmark：完整 benchmark.json 生成（结构 + 字段）
- 5 个场景的覆盖与配置
- 数据格式正确性（数值范围、单位、阈值一致性）
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

# ============================================================
# 通过 importlib 加载 generate_benchmark 模块
# ============================================================
_THIS_DIR = Path(__file__).resolve().parent
_MODULE_PATH = _THIS_DIR / "generate_benchmark.py"

_spec = importlib.util.spec_from_file_location("generate_benchmark", str(_MODULE_PATH))
assert _spec is not None and _spec.loader is not None
gb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gb)


@pytest.fixture(scope="module")
def benchmark() -> dict:
    """构建一次完整 benchmark，供本模块所有测试共享。"""
    return gb.build_benchmark()


# ============================================================
# 1. build_benchmark 整体结构
# ============================================================

def test_benchmark_top_level_fields(benchmark: dict) -> None:
    """build_benchmark 顶层字段应完整。"""
    assert benchmark["schema"] == "solar-system-benchmark/v1"
    assert benchmark["version"] == "0.1.0"
    assert benchmark["generated"] == "smoke"
    assert "tiers" in benchmark
    assert "tier_thresholds" in benchmark
    assert "scenes" in benchmark
    assert "total_scenes" in benchmark
    assert isinstance(benchmark["scenes"], list)


def test_benchmark_total_scenes_5(benchmark: dict) -> None:
    """场景数应为 5（idle/cruise/terrain/events/stress）。"""
    assert benchmark["total_scenes"] == 5
    assert len(benchmark["scenes"]) == 5


def test_benchmark_tiers_complete(benchmark: dict) -> None:
    """性能等级应包含 4 档（ultra/high/medium/low）。"""
    assert benchmark["tiers"] == ["ultra", "high", "medium", "low"]
    thresholds = benchmark["tier_thresholds"]
    assert "fps" in thresholds
    assert "memory_mb" in thresholds
    assert "draw_calls" in thresholds
    assert "triangles_m" in thresholds
    assert thresholds["fps"] == gb.PERF_TIERS
    assert thresholds["memory_mb"] == gb.MEM_BUDGET_MB
    assert thresholds["draw_calls"] == gb.DRAW_CALL_BUDGET
    assert thresholds["triangles_m"] == gb.TRIANGLE_BUDGET_M


# ============================================================
# 2. 场景覆盖（不同天体数）
# ============================================================

def test_benchmark_scene_ids(benchmark: dict) -> None:
    """5 个 scene_id 应为 idle/cruise/terrain/events/stress。"""
    ids = [s["scene_id"] for s in benchmark["scenes"]]
    assert ids == ["idle", "cruise", "terrain", "events", "stress"]


def test_benchmark_scene_body_coverage(benchmark: dict) -> None:
    """不同场景的天体数覆盖：idle=3, cruise=20, terrain=1, events=10, stress=297。"""
    expected = {"idle": 3, "cruise": 20, "terrain": 1, "events": 10, "stress": 297}
    for scene in benchmark["scenes"]:
        assert scene["config"]["bodies"] == expected[scene["scene_id"]], \
            f"场景 {scene['scene_id']} 天体数不匹配"


def test_benchmark_stress_scene_max_load(benchmark: dict) -> None:
    """stress 场景应使用最大粒子负载（100000）与最大 LOD bias（2.0）。"""
    stress = next(s for s in benchmark["scenes"] if s["scene_id"] == "stress")
    assert stress["config"]["particles"] == 100000
    assert stress["config"]["lod_bias"] == 2.0
    assert stress["config"]["bodies"] == 297


def test_benchmark_idle_scene_minimal(benchmark: dict) -> None:
    """idle 场景应为最小负载（3 体、0 粒子）。"""
    idle = next(s for s in benchmark["scenes"] if s["scene_id"] == "idle")
    assert idle["config"]["bodies"] == 3
    assert idle["config"]["particles"] == 0
    assert idle["config"]["lod_bias"] == 0.0


# ============================================================
# 3. 单场景字段完整性
# ============================================================

REQUIRED_SCENE_FIELDS = {"scene_id", "name_cn", "description", "config", "targets",
                         "duration_seconds", "warmup_seconds"}
REQUIRED_CONFIG_FIELDS = {"bodies", "particles", "lod_bias", "shadow_cascades", "vsync"}


def test_benchmark_scene_fields_complete(benchmark: dict) -> None:
    """每个场景应包含全部必需字段。"""
    for scene in benchmark["scenes"]:
        missing = REQUIRED_SCENE_FIELDS - set(scene.keys())
        assert not missing, f"场景 {scene.get('scene_id')} 缺字段: {missing}"


def test_benchmark_scene_config_fields(benchmark: dict) -> None:
    """每个场景 config 应包含全部必需字段。"""
    for scene in benchmark["scenes"]:
        cfg = scene["config"]
        missing = REQUIRED_CONFIG_FIELDS - set(cfg.keys())
        assert not missing, f"场景 {scene['scene_id']} config 缺字段: {missing}"


def test_benchmark_scene_targets_have_all_tiers(benchmark: dict) -> None:
    """每个场景的 targets 应包含 4 个性能等级。"""
    for scene in benchmark["scenes"]:
        targets = scene["targets"]
        assert set(targets.keys()) == {"ultra", "high", "medium", "low"}
        for tier, target in targets.items():
            assert "min_fps" in target
            assert "max_frame_time_ms" in target
            assert "max_memory_mb" in target
            assert "max_draw_calls" in target
            assert "max_triangles_m" in target
            assert "post_processing" in target


def test_benchmark_scene_names_descriptions_nonempty(benchmark: dict) -> None:
    """场景 name_cn 与 description 不应为空。"""
    for scene in benchmark["scenes"]:
        assert scene["name_cn"].strip() != ""
        assert scene["description"].strip() != ""


# ============================================================
# 4. 数据格式正确性（数值范围、单位、阈值一致性）
# ============================================================

def test_benchmark_fps_thresholds_descending(benchmark: dict) -> None:
    """性能等级 FPS 阈值应递减：ultra > high > medium > low。"""
    fps = benchmark["tier_thresholds"]["fps"]
    assert fps["ultra"] > fps["high"] > fps["medium"] > fps["low"]
    assert fps["ultra"] == 120
    assert fps["high"] == 60
    assert fps["medium"] == 30
    assert fps["low"] == 15


def test_benchmark_memory_budget_descending(benchmark: dict) -> None:
    """内存预算应递减：ultra > high > medium > low。"""
    mem = benchmark["tier_thresholds"]["memory_mb"]
    assert mem["ultra"] > mem["high"] > mem["medium"] > mem["low"]
    assert mem["ultra"] == 2048
    assert mem["low"] == 256


def test_benchmark_draw_call_budget_descending(benchmark: dict) -> None:
    """Draw call 预算应递减：ultra > high > medium > low。"""
    dc = benchmark["tier_thresholds"]["draw_calls"]
    assert dc["ultra"] > dc["high"] > dc["medium"] > dc["low"]


def test_benchmark_triangle_budget_descending(benchmark: dict) -> None:
    """三角形预算应递减：ultra > high > medium > low。"""
    tri = benchmark["tier_thresholds"]["triangles_m"]
    assert tri["ultra"] > tri["high"] > tri["medium"] > tri["low"]


def test_benchmark_target_fps_matches_frame_time(benchmark: dict) -> None:
    """每个 target 的 max_frame_time_ms 应等于 1000 / min_fps。"""
    for scene in benchmark["scenes"]:
        for tier, target in scene["targets"].items():
            expected_ms = round(1000.0 / target["min_fps"], 2)
            assert target["max_frame_time_ms"] == pytest.approx(expected_ms, rel=1e-3), \
                f"场景 {scene['scene_id']}/{tier}: frame_time {target['max_frame_time_ms']} " \
                f"与 1000/{target['min_fps']}={expected_ms} 不一致"


def test_benchmark_target_thresholds_match_global(benchmark: dict) -> None:
    """每个场景 target 的内存/draw call/triangles 阈值应与全局 tier_thresholds 一致。"""
    global_t = benchmark["tier_thresholds"]
    for scene in benchmark["scenes"]:
        for tier, target in scene["targets"].items():
            assert target["max_memory_mb"] == global_t["memory_mb"][tier]
            assert target["max_draw_calls"] == global_t["draw_calls"][tier]
            assert target["max_triangles_m"] == global_t["triangles_m"][tier]
            assert target["min_fps"] == global_t["fps"][tier]


def test_benchmark_target_post_processing_only_low_disabled(benchmark: dict) -> None:
    """后处理仅在 low 档关闭，其他档开启。"""
    for scene in benchmark["scenes"]:
        for tier, target in scene["targets"].items():
            if tier == "low":
                assert target["post_processing"] is False
            else:
                assert target["post_processing"] is True


def test_benchmark_scene_bodies_nonnegative(benchmark: dict) -> None:
    """所有场景的 bodies 应为非负整数。"""
    for scene in benchmark["scenes"]:
        b = scene["config"]["bodies"]
        assert isinstance(b, int)
        assert b >= 1  # 至少 1 个天体（terrain 是 1）


def test_benchmark_scene_particles_nonnegative(benchmark: dict) -> None:
    """所有场景的 particles 应为非负整数。"""
    for scene in benchmark["scenes"]:
        p = scene["config"]["particles"]
        assert isinstance(p, int)
        assert p >= 0


def test_benchmark_scene_shadow_cascades_range(benchmark: dict) -> None:
    """shadow_cascades 应在合理范围 [0, 4]。"""
    for scene in benchmark["scenes"]:
        sc = scene["config"]["shadow_cascades"]
        assert isinstance(sc, int)
        assert 0 <= sc <= 4


def test_benchmark_scene_duration_positive(benchmark: dict) -> None:
    """duration_seconds 与 warmup_seconds 应为正数，且 duration > warmup。"""
    for scene in benchmark["scenes"]:
        assert scene["duration_seconds"] > 0
        assert scene["warmup_seconds"] >= 0
        assert scene["duration_seconds"] > scene["warmup_seconds"]


# ============================================================
# 5. _build_scene 单元测试
# ============================================================

def test_build_scene_returns_expected_structure() -> None:
    """_build_scene 应返回符合预期的结构。"""
    scene = gb._build_scene(
        "test", "测试场景", "测试描述",
        bodies=5, particles=100, lod_bias=0.5, shadow_cascades=2,
    )
    assert scene["scene_id"] == "test"
    assert scene["name_cn"] == "测试场景"
    assert scene["description"] == "测试描述"
    assert scene["config"]["bodies"] == 5
    assert scene["config"]["particles"] == 100
    assert scene["config"]["lod_bias"] == 0.5
    assert scene["config"]["shadow_cascades"] == 2
    assert scene["config"]["vsync"] is True
    assert scene["duration_seconds"] == 30
    assert scene["warmup_seconds"] == 3
    # targets 应覆盖 4 个 tier
    assert set(scene["targets"].keys()) == {"ultra", "high", "medium", "low"}


def test_build_scene_vsync_always_true() -> None:
    """_build_scene 应始终把 vsync 设为 True（默认开启垂直同步）。"""
    scene = gb._build_scene("x", "x", "x", 1, 0, 0.0, 1)
    assert scene["config"]["vsync"] is True
