"""build_catalog.py 单元测试（Task 17.2 / 修复 R-08 补充项）。

覆盖：
- build_catalog：catalog.json 生成（结构 + 字段完整性）
- 天体分类（行星/卫星/矮行星/小行星/彗星/TNO/恒星）
- ID 唯一性（注意：整数 ID 与字符串 ID 共存）
- 辅助函数 _cn_num / _roman
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

# ============================================================
# 通过 importlib 加载 build_catalog 模块
# ============================================================
_THIS_DIR = Path(__file__).resolve().parent
_MODULE_PATH = _THIS_DIR / "build_catalog.py"

_spec = importlib.util.spec_from_file_location("build_catalog", str(_MODULE_PATH))
assert _spec is not None and _spec.loader is not None
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)


@pytest.fixture(scope="module")
def catalog() -> dict:
    """构建一次完整 catalog，供本模块所有测试共享。"""
    return bc.build_catalog()


# ============================================================
# 1. catalog 整体结构
# ============================================================

def test_catalog_top_level_structure(catalog: dict) -> None:
    """catalog 顶层字段应完整。"""
    assert catalog["schema"] == "solar-system-catalog/v1"
    assert catalog["version"] == "0.1.0"
    assert catalog["generated"] == "smoke"
    assert "total" in catalog
    assert "type_counts" in catalog
    assert "bodies" in catalog
    assert isinstance(catalog["bodies"], list)
    assert catalog["total"] == len(catalog["bodies"])


def test_catalog_total_count_297(catalog: dict) -> None:
    """catalog 总条目数应为 297（恒星1+行星8+卫星248+矮行星10+小行星21+彗星4+TNO5）。"""
    assert catalog["total"] == 297
    expected_type_counts = {
        "star": 1,
        "planet": 8,
        "satellite": 248,
        "dwarf-planet": 10,
        "asteroid": 21,
        "comet": 4,
        "tno": 5,
    }
    assert catalog["type_counts"] == expected_type_counts


# ============================================================
# 2. 字段完整性
# ============================================================

REQUIRED_FIELDS = {"body_id", "name_cn", "name_en", "type", "parent_id",
                   "radius_km", "semi_major", "eccentricity", "asset_tier"}


def test_catalog_entry_fields_complete(catalog: dict) -> None:
    """每条记录都应包含全部必需字段。"""
    for entry in catalog["bodies"]:
        missing = REQUIRED_FIELDS - set(entry.keys())
        assert not missing, f"entry {entry.get('body_id')} missing fields: {missing}"


def test_catalog_entry_types(catalog: dict) -> None:
    """字段类型应正确：body_id 是 int 或 str，name 是 str，radius 是 float。"""
    for entry in catalog["bodies"]:
        assert isinstance(entry["body_id"], (int, str))
        assert isinstance(entry["name_cn"], str)
        assert isinstance(entry["name_en"], str)
        assert isinstance(entry["type"], str)
        assert isinstance(entry["parent_id"], (int, str))
        assert isinstance(entry["radius_km"], (int, float))
        assert isinstance(entry["semi_major"], (int, float))
        assert isinstance(entry["eccentricity"], (int, float))
        assert entry["asset_tier"] in {"S", "A", "B", "C"}


def test_catalog_names_not_empty(catalog: dict) -> None:
    """所有名称（中/英）不应为空或仅空白。"""
    for entry in catalog["bodies"]:
        assert entry["name_cn"].strip() != "", f"body_id={entry['body_id']} 中文命名为空"
        assert entry["name_en"].strip() != "", f"body_id={entry['body_id']} 英文命名为空"


# ============================================================
# 3. 分类正确性
# ============================================================

def test_catalog_type_values_are_valid(catalog: dict) -> None:
    """type 字段必须取自预定义枚举。"""
    valid_types = {
        bc.TYPE_STAR, bc.TYPE_PLANET, bc.TYPE_SATELLITE,
        bc.TYPE_DWARF_PLANET, bc.TYPE_ASTEROID, bc.TYPE_COMET, bc.TYPE_TNO,
    }
    for entry in catalog["bodies"]:
        assert entry["type"] in valid_types


def test_catalog_planets_have_8_entries(catalog: dict) -> None:
    """行星应有 8 条记录，且 body_id 为 1-8。"""
    planets = [e for e in catalog["bodies"] if e["type"] == bc.TYPE_PLANET]
    assert len(planets) == 8
    planet_ids = sorted(e["body_id"] for e in planets)
    assert planet_ids == [1, 2, 3, 4, 5, 6, 7, 8]


def test_catalog_star_is_only_sun(catalog: dict) -> None:
    """恒星应只有 1 条（太阳），body_id=0。"""
    stars = [e for e in catalog["bodies"] if e["type"] == bc.TYPE_STAR]
    assert len(stars) == 1
    assert stars[0]["body_id"] == 0
    assert stars[0]["name_en"] == "Sun"
    assert stars[0]["asset_tier"] == "S"


def test_catalog_comets_have_string_ids(catalog: dict) -> None:
    """彗星的 body_id 应为字符串（如 '1P'）。"""
    comets = [e for e in catalog["bodies"] if e["type"] == bc.TYPE_COMET]
    assert len(comets) == 4
    for comet in comets:
        assert isinstance(comet["body_id"], str)
        assert comet["body_id"] in {"1P", "2P", "9P", "67P"}


def test_catalog_satellites_parent_relationship(catalog: dict) -> None:
    """所有卫星的 parent_id 应为某个行星或矮行星的 body_id。"""
    parent_ids = {e["body_id"] for e in catalog["bodies"]
                  if e["type"] in {bc.TYPE_PLANET, bc.TYPE_DWARF_PLANET}}
    parent_ids.add(0)  # 太阳作为兜底
    satellites = [e for e in catalog["bodies"] if e["type"] == bc.TYPE_SATELLITE]
    for sat in satellites:
        assert sat["parent_id"] in parent_ids, \
            f"卫星 {sat['body_id']} 的 parent_id={sat['parent_id']} 不在父体集合"


# ============================================================
# 4. ID 唯一性
# ============================================================

def test_catalog_body_ids_unique(catalog: dict) -> None:
    """所有 body_id（含整数与字符串）应全局唯一。"""
    ids = [e["body_id"] for e in catalog["bodies"]]
    # 用 str 转换为统一可哈希形式比较
    id_strs = [str(i) for i in ids]
    assert len(id_strs) == len(set(id_strs)), "存在重复 body_id"


def test_catalog_string_ids_distinct_from_int(catalog: dict) -> None:
    """字符串 body_id（如 '1P'）与整数 body_id 不应冲突（字符串 '1' 不应等于 int 1）。"""
    int_ids = {e["body_id"] for e in catalog["bodies"] if isinstance(e["body_id"], int)}
    str_ids = {e["body_id"] for e in catalog["bodies"] if isinstance(e["body_id"], str)}
    # 字符串 ID 全部以字母结尾（如 1P/2P/9P/67P），与数字不冲突
    for sid in str_ids:
        assert not sid.isdigit(), f"字符串 body_id {sid} 是纯数字，可能与整数 ID 冲突"


# ============================================================
# 5. 辅助函数 _cn_num / _roman
# ============================================================

def test_cn_num_basic() -> None:
    """_cn_num 把数字转中文（已知输入→已知输出）。"""
    assert bc._cn_num(0) == "零"
    assert bc._cn_num(1) == "一"
    assert bc._cn_num(10) == "十"
    assert bc._cn_num(13) == "十三"
    assert bc._cn_num(42) == "四十二"
    assert bc._cn_num(105) == "一百零五"
    assert bc._cn_num(2024) == "二千零二十四"


def test_roman_basic() -> None:
    """_roman 把整数转罗马数字（已知输入→已知输出）。"""
    assert bc._roman(1) == "I"
    assert bc._roman(4) == "IV"
    assert bc._roman(9) == "IX"
    assert bc._roman(13) == "XIII"
    assert bc._roman(2024) == "MMXXIV"
    # 超出范围返回原数字字符串
    assert bc._roman(0) == "0"
    assert bc._roman(4000) == "4000"


# ============================================================
# 6. 资产分层合理性
# ============================================================

def test_catalog_asset_tiers_reasonable(catalog: dict) -> None:
    """S 级应至少覆盖太阳、地球、月球；C 级主要给合成体。"""
    by_tier: dict[str, list] = {}
    for entry in catalog["bodies"]:
        by_tier.setdefault(entry["asset_tier"], []).append(entry["body_id"])

    # S 级至少包含太阳(0) 与地球(3) 与月球(301)
    s_set = set(by_tier.get("S", []))
    assert {0, 3, 301}.issubset(s_set)

    # C 级应有合成卫星与 TNO/部分矮行星
    c_set = set(by_tier.get("C", []))
    assert len(c_set) > 0


def test_catalog_synthetic_satellites_marked(catalog: dict) -> None:
    """合成卫星应在 5100+/6100+/7100+/8100+ 区间，且至少 200 条。"""
    synth_ids = [e["body_id"] for e in catalog["bodies"]
                 if isinstance(e["body_id"], int)
                 and (5100 <= e["body_id"] < 5200
                      or 6100 <= e["body_id"] < 6200
                      or 7100 <= e["body_id"] < 7200
                      or 8100 <= e["body_id"] < 8200)]
    assert len(synth_ids) >= 200


def test_catalog_main_asteroids_count(catalog: dict) -> None:
    """主带小行星 + 近地小行星总数应为 21。"""
    asteroids = [e for e in catalog["bodies"] if e["type"] == bc.TYPE_ASTEROID]
    assert len(asteroids) == 21
    # 5 真实主带 + 11 合成主带 + 5 近地
    main_count = sum(1 for a in asteroids if a.get("extra", {}).get("belt") == "main"
                     or (isinstance(a["body_id"], int) and 2001 <= a["body_id"] <= 2211))
    # 检查 belt 字段
    main_with_belt = sum(1 for a in asteroids if "belt" in a and a["belt"] == "main")
    near_earth = sum(1 for a in asteroids if "belt" in a and a["belt"] == "near_earth")
    assert main_with_belt + near_earth == 21
