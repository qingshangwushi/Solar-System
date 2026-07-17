"""build_search_index.py 单元测试（Task 17.4 / 修复 R-08 补充项）。

覆盖：
- _normalize：统一小写、去空格、去标点
- _pinyin_of：中文 → 拼音
- _first_letter：英文名首字母
- build_search_index：4 类索引（拼音/别名/数字/首字母分组）生成
- 索引完整性、查询性能
"""
from __future__ import annotations

import importlib.util
import time
from pathlib import Path

import pytest

# ============================================================
# 通过 importlib 加载 build_search_index 模块
# ============================================================
_THIS_DIR = Path(__file__).resolve().parent
_MODULE_PATH = _THIS_DIR / "build_search_index.py"

_spec = importlib.util.spec_from_file_location("build_search_index", str(_MODULE_PATH))
assert _spec is not None and _spec.loader is not None
bsi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsi)


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def mini_catalog() -> dict:
    """最小化测试 catalog（覆盖中英文/数字 ID/字符串 ID 等场景）。"""
    return {
        "bodies": [
            {"body_id": 0, "name_cn": "太阳", "name_en": "Sun"},
            {"body_id": 3, "name_cn": "地球", "name_en": "Earth"},
            {"body_id": 301, "name_cn": "月球", "name_en": "Moon"},
            {"body_id": 501, "name_cn": "木卫一", "name_en": "Io"},
            {"body_id": 9, "name_cn": "冥王星", "name_en": "Pluto"},
            {"body_id": "1P", "name_cn": "哈雷彗星", "name_en": "Halley"},
            {"body_id": 2001, "name_cn": "灶神星", "name_en": "Vesta"},
        ]
    }


@pytest.fixture
def index(mini_catalog: dict) -> dict:
    """基于 mini_catalog 构建搜索索引。"""
    return bsi.build_search_index(mini_catalog)


# ============================================================
# 1. _normalize
# ============================================================

def test_normalize_lowercases() -> None:
    """_normalize 应转小写。"""
    assert bsi._normalize("Earth") == "earth"
    assert bsi._normalize("SUN") == "sun"


def test_normalize_removes_whitespace_punctuation() -> None:
    """_normalize 应去除空格、连字符、下划线、逗号、点、中点、斜杠等。"""
    assert bsi._normalize("Churyumov-Gerasimenko") == "churyumovgerasimenko"
    # _normalize 当前正则不剥离撇号 '，但剥离空格
    assert bsi._normalize("Halley's Comet") == "halley'scomet"
    assert bsi._normalize("a b_c-d.e") == "abcde"
    assert bsi._normalize("Tempel 1") == "tempel1"
    # 中点 · 也应被剥离
    assert bsi._normalize("丘留莫夫·格拉西缅科") == "丘留莫夫格拉西缅科"


def test_normalize_empty_string() -> None:
    """空串应返回空串。"""
    assert bsi._normalize("") == ""


# ============================================================
# 2. _pinyin_of
# ============================================================

def test_pinyin_of_known_bodies() -> None:
    """已知天体名应能映射到拼音。"""
    assert bsi._pinyin_of("太阳") == "taiyang"
    assert bsi._pinyin_of("地球") == "diqiu"
    assert bsi._pinyin_of("月球") == "yueqiu"
    assert bsi._pinyin_of("冥王星") == "mingwangxing"


def test_pinyin_of_unknown_returns_none() -> None:
    """未知中文名应返回 None（调用方可用 body_id 兜底）。"""
    assert bsi._pinyin_of("未命名天体XYZ") is None
    assert bsi._pinyin_of("") is None


def test_pinyin_of_strips_whitespace() -> None:
    """_pinyin_of 应去除中文首尾空白。"""
    assert bsi._pinyin_of("  地球  ") == "diqiu"


# ============================================================
# 3. _first_letter
# ============================================================

def test_first_letter_basic() -> None:
    """_first_letter 取首字母（大写）。"""
    assert bsi._first_letter("Earth") == "E"
    assert bsi._first_letter("sun") == "S"
    assert bsi._first_letter("Io") == "I"


def test_first_letter_empty_or_non_alpha() -> None:
    """空串或非字母开头返回 '#'。"""
    assert bsi._first_letter("") == "#"
    assert bsi._first_letter("   ") == "#"
    assert bsi._first_letter("1P") == "#"
    assert bsi._first_letter("1992 QB1") == "#"


# ============================================================
# 4. build_search_index 整体结构
# ============================================================

def test_build_search_index_top_level_fields(index: dict, mini_catalog: dict) -> None:
    """build_search_index 顶层字段应完整。"""
    assert index["schema"] == "solar-system-search-index/v1"
    assert index["version"] == "0.1.0"
    assert index["generated"] == "smoke"
    assert index["source_total"] == len(mini_catalog["bodies"])
    assert "pinyin_index" in index
    assert "alias_index" in index
    assert "number_index" in index
    assert "first_letter_groups" in index


def test_build_search_index_pinyin_index(index: dict) -> None:
    """拼音索引应包含已知中文名的拼音映射。"""
    pinyin = index["pinyin_index"]
    # 太阳、地球、月球、冥王星 都在 PINYIN_TABLE 中
    assert "taiyang" in pinyin and 0 in pinyin["taiyang"]
    assert "diqiu" in pinyin and 3 in pinyin["diqiu"]
    assert "yueqiu" in pinyin and 301 in pinyin["yueqiu"]
    assert "mingwangxing" in pinyin and 9 in pinyin["mingwangxing"]


def test_build_search_index_alias_index(index: dict) -> None:
    """别名索引应包含中文名、英文名、body_id 字符串、已知英文别名。"""
    alias = index["alias_index"]
    # 中文名
    assert "太阳" in alias and 0 in alias["太阳"]
    # 英文名
    assert "earth" in alias and 3 in alias["earth"]
    # body_id 字符串形式
    assert "301" in alias and 301 in alias["301"]
    # ALIAS_TABLE 中 Earth -> ["Tellus", "Terra"]
    assert "tellus" in alias and 3 in alias["tellus"]
    assert "terra" in alias and 3 in alias["terra"]
    # Moon -> ["Luna"]
    assert "luna" in alias and 301 in alias["luna"]
    # Halley -> ["1P", "Halley's Comet"]，归一化后 "1p" 与 "halley'scomet"（撇号保留）
    assert "1p" in alias and "1P" in alias["1p"]
    assert "halley'scomet" in alias and "1P" in alias["halley'scomet"]


def test_build_search_index_number_index(index: dict) -> None:
    """数字索引应仅包含纯数字 body_id 字符串。"""
    number = index["number_index"]
    # 整数 body_id 进入数字索引
    assert "0" in number and 0 in number["0"]
    assert "3" in number and 3 in number["3"]
    assert "301" in number and 301 in number["301"]
    assert "2001" in number and 2001 in number["2001"]
    # 字符串 body_id（如 '1P'）不应进入数字索引
    assert "1P" not in number


def test_build_search_index_first_letter_groups(index: dict) -> None:
    """首字母分组应按英文名首字母分组。"""
    groups = index["first_letter_groups"]
    assert "S" in groups and 0 in groups["S"]  # Sun
    assert "E" in groups and 3 in groups["E"]  # Earth
    assert "M" in groups and 301 in groups["M"]  # Moon
    assert "I" in groups and 501 in groups["I"]  # Io
    assert "P" in groups and 9 in groups["P"]  # Pluto
    assert "H" in groups and "1P" in groups["H"]  # Halley
    assert "V" in groups and 2001 in groups["V"]  # Vesta


# ============================================================
# 5. 索引完整性
# ============================================================

def test_index_every_body_has_alias_entry(index: dict, mini_catalog: dict) -> None:
    """每个天体至少应有一条 alias_index 条目（用 body_id 字符串兜底）。"""
    alias = index["alias_index"]
    all_indexed_ids: set = set()
    for bid_list in alias.values():
        for bid in bid_list:
            all_indexed_ids.add(bid)
    for body in mini_catalog["bodies"]:
        assert body["body_id"] in all_indexed_ids, \
            f"天体 {body['body_id']} 没有任何 alias_index 条目"


def test_index_every_body_has_first_letter(index: dict, mini_catalog: dict) -> None:
    """每个天体应进入某个首字母分组（包括 '#' 分组）。"""
    groups = index["first_letter_groups"]
    all_indexed_ids: set = set()
    for bid_list in groups.values():
        for bid in bid_list:
            all_indexed_ids.add(bid)
    for body in mini_catalog["bodies"]:
        assert body["body_id"] in all_indexed_ids


def test_index_deduplication(index: dict) -> None:
    """同一索引键下的 body_id 列表应去重。"""
    for d in (index["pinyin_index"], index["alias_index"],
              index["number_index"], index["first_letter_groups"]):
        for key, ids in d.items():
            assert len(ids) == len(set(map(str, ids))), \
                f"索引 {key} 下存在重复 body_id: {ids}"


def test_index_empty_catalog() -> None:
    """空 catalog 应返回空索引且不抛异常。"""
    index = bsi.build_search_index({"bodies": []})
    assert index["source_total"] == 0
    assert index["pinyin_index"] == {}
    assert index["alias_index"] == {}
    assert index["number_index"] == {}
    assert index["first_letter_groups"] == {}


# ============================================================
# 6. 查询性能（小规模数据）
# ============================================================

def test_index_lookup_performance_small_scale(index: dict) -> None:
    """对 1000 次查询，alias_index 字典查找应 < 100ms（小规模基线）。"""
    keys = list(index["alias_index"].keys())
    assert len(keys) > 0
    start = time.perf_counter()
    for _ in range(1000):
        for k in keys:
            _ = index["alias_index"][k]
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert elapsed_ms < 100.0, f"查询耗时 {elapsed_ms:.2f}ms 超出 100ms 基线"


def test_index_pinyin_lookup_known_bodies(index: dict) -> None:
    """对已知天体的拼音查询应能命中正确 body_id。"""
    pinyin = index["pinyin_index"]
    test_cases = [
        ("taiyang", 0),
        ("diqiu", 3),
        ("yueqiu", 301),
        ("mingwangxing", 9),
        ("zaoshenxing", 2001),  # 灶神星
        ("muweiyi", 501),  # 木卫一
    ]
    for py, expected_bid in test_cases:
        assert py in pinyin, f"拼音 '{py}' 未在索引中"
        assert expected_bid in pinyin[py], \
            f"拼音 '{py}' 未映射到 body_id={expected_bid}"


# ============================================================
# 7. 完整 catalog 集成
# ============================================================

def test_index_with_full_catalog() -> None:
    """使用 build_catalog 输出构建索引，应能覆盖全部 297 体（每体至少 1 个 alias 条目）。"""
    # 加载 build_catalog 模块
    catalog_path = _THIS_DIR.parent / "catalog-pipeline" / "build_catalog.py"
    spec_c = importlib.util.spec_from_file_location("build_catalog", str(catalog_path))
    assert spec_c is not None and spec_c.loader is not None
    bc = importlib.util.module_from_spec(spec_c)
    spec_c.loader.exec_module(bc)

    catalog = bc.build_catalog()
    index = bsi.build_search_index(catalog)

    assert index["source_total"] == 297
    # 每个体至少有一个 alias_index 条目（通过 body_id 字符串兜底）
    all_indexed_ids: set = set()
    for bid_list in index["alias_index"].values():
        for bid in bid_list:
            all_indexed_ids.add(bid)
    assert len(all_indexed_ids) == 297
    # 首字母分组应覆盖全部 297 体
    all_letter_ids: set = set()
    for bid_list in index["first_letter_groups"].values():
        for bid in bid_list:
            all_letter_ids.add(bid)
    assert len(all_letter_ids) == 297
