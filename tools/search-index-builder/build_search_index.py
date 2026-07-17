#!/usr/bin/env python3
"""search-index 构建管线（设计文档 14.4 / 修复 E-42）。

读取 `data-src/normalized/catalog.json`，构建 4 类索引：
1. `pinyin_index`：拼音（无空格小写）→ body_id 列表
2. `alias_index`：别名（中文名/英文名/编号字符串）→ body_id 列表
3. `number_index`：阿拉伯数字字符串 → body_id 列表（用于 "301"、"2001" 等编号搜索）
4. `first_letter_groups`：英文名首字母 → body_id 列表（按字母分组快速浏览）

辅助函数：
- `_pinyin_of(cn: str) -> str`：把中文天体名映射到拼音（内置 58 体的汉字→拼音表）
- `_normalize(s: str) -> str`：统一小写、去空格、去标点

输出 schema：solar-system-search-index/v1

用法：
    python tools/search-index-builder/build_search_index.py \
        [--catalog data-src/normalized/catalog.json] \
        [--out data-src/normalized/search-index.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
from typing import Any

# ============================================================
# 58 体的中文 → 拼音映射表（用于拼音索引）
# 仅覆盖 catalog 中真实命名的天体；合成体用 body_id 兜底
# ============================================================

PINYIN_TABLE: dict[str, str] = {
    # 恒星
    "太阳": "taiyang",
    # 行星
    "水星": "shuixing", "金星": "jinxing", "地球": "diqiu", "火星": "huoxing",
    "木星": "muxing", "土星": "tuxing", "天王星": "tianwangxing", "海王星": "haiwangxing",
    # 月球与火星卫星
    "月球": "yueqiu", "火卫一": "huoweiyi", "火卫二": "huoweier",
    # 木星卫星（伽利略 + 主要）
    "木卫一": "muweiyi", "木卫二": "muweier", "木卫三": "muweisan", "木卫四": "muweisi",
    "木卫五": "muweiwu", "木卫六": "muweiliu", "木卫七": "muweiqi",
    # 土星卫星
    "土卫一": "tuweiyi", "土卫二": "tuweier", "土卫三": "tuweisan", "土卫四": "tuweisi",
    "土卫五": "tuweiwu", "土卫六": "tuweiliu", "土卫七": "tuweiqi", "土卫八": "tuweiba",
    "土卫九": "tuweijiu",
    # 天王星卫星
    "天卫一": "tianweiyi", "天卫二": "tianweier", "天卫三": "tianweisan",
    "天卫四": "tianweisi", "天卫五": "tianweiwu",
    # 海王星卫星
    "海卫一": "haiweiyi", "海卫二": "haiweier", "海卫三": "haiweisan", "海卫四": "haiweisi",
    "海卫五": "haiweiwu", "海卫六": "haiweiliu", "海卫七": "haiweiqi", "海卫八": "haiweiba",
    # 矮行星
    "冥王星": "mingwangxing", "阋神星": "xishenxing", "鸟神星": "niaoshenxing",
    "谷神星": "gushenxing", "妊神星": "renshenxing", "亡神星": "wangshenxing",
    "创神星": "chuangshenxing", "塞德娜": "saidena", "共工星": "gonggongxing",
    # 主要小行星
    "灶神星": "zaoshenxing", "智神星": "zhishenxing", "健神星": "jianshenxing",
    "虹神星": "hongshenxing", "花神星": "huashenxing",
    "爱神星": "aishenxing", "丝神星": "sishenxing",
    # 彗星
    "哈雷彗星": "haleihuixing", "恩克彗星": "enkehuixing",
    # 矮行星卫星
    "冥卫一": "mingweiyi", "冥卫二": "mingweier", "冥卫三": "mingweisan",
    "亡神卫一": "wangshenweiyi",
}

# 已知英文别名（覆盖部分常见别名）
ALIAS_TABLE: dict[str, list[str]] = {
    "Earth": ["Tellus", "Terra"],
    "Moon": ["Luna"],
    "Halley": ["1P", "Halley's Comet"],
    "Jupiter": ["Jove"],
    "Saturn": ["Cronus"],
}


def _normalize(s: str) -> str:
    """统一小写、去空格、去标点。"""
    out = s.lower()
    out = re.sub(r"[\s\-_,.·/]+", "", out)
    return out


def _pinyin_of(cn: str) -> str | None:
    """把中文天体名映射到拼音（无空格小写）。

    内置 58 体的汉字→拼音表。未命中返回 None（调用方可用 body_id 兜底）。
    """
    raw = PINYIN_TABLE.get(cn.strip())
    if raw is None:
        return None
    return _normalize(raw)


def _first_letter(en: str) -> str:
    """取英文名首字母（大写）。空串返回 '#'。"""
    s = en.strip()
    if not s:
        return "#"
    ch = s[0].upper()
    return ch if ch.isalpha() else "#"


def build_search_index(catalog: dict[str, Any]) -> dict[str, Any]:
    """从 catalog 构建搜索索引对象。"""
    pinyin_index: dict[str, list[Any]] = {}
    alias_index: dict[str, list[Any]] = {}
    number_index: dict[str, list[Any]] = {}
    first_letter_groups: dict[str, list[Any]] = {}

    for body in catalog.get("bodies", []):
        bid = body.get("body_id")
        cn = str(body.get("name_cn", "")).strip()
        en = str(body.get("name_en", "")).strip()

        # 1. 拼音索引
        py = _pinyin_of(cn)
        if py:
            pinyin_index.setdefault(py, []).append(bid)

        # 2. 别名索引：中文名 / 英文名 / 已知英文别名 / body_id 字符串形式
        aliases = [cn, en]
        if en in ALIAS_TABLE:
            aliases.extend(ALIAS_TABLE[en])
        # 把 body_id（数字或字符串）作为可搜索别名
        aliases.append(str(bid))
        for alias in aliases:
            if not alias:
                continue
            key = _normalize(alias)
            if key:
                alias_index.setdefault(key, []).append(bid)

        # 3. 数字索引：body_id 是整数或纯数字字符串时，按字符串形式建索引
        bid_str = str(bid)
        if bid_str.isdigit():
            number_index.setdefault(bid_str, []).append(bid)

        # 4. 首字母分组
        letter = _first_letter(en)
        first_letter_groups.setdefault(letter, []).append(bid)

    # 去重
    def _dedupe(d: dict[str, list[Any]]) -> dict[str, list[Any]]:
        return {k: list(dict.fromkeys(v)) for k, v in d.items()}

    return {
        "schema": "solar-system-search-index/v1",
        "version": "0.1.0",
        "generated": "smoke",
        "source_total": len(catalog.get("bodies", [])),
        "pinyin_index": _dedupe(pinyin_index),
        "alias_index": _dedupe(alias_index),
        "number_index": _dedupe(number_index),
        "first_letter_groups": _dedupe(first_letter_groups),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 search-index.json")
    parser.add_argument("--catalog", default=None,
                        help="catalog.json 路径（默认：data-src/normalized/catalog.json）")
    parser.add_argument("--out", default=None,
                        help="输出路径（默认：data-src/normalized/search-index.json）")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    catalog_path = os.path.abspath(args.catalog) if args.catalog else \
        os.path.join(project_root, "data-src", "normalized", "catalog.json")
    out_path = os.path.abspath(args.out) if args.out else \
        os.path.join(project_root, "data-src", "normalized", "search-index.json")

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    index = build_search_index(catalog)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"==> search-index.json 已生成：{out_path}")
    print(f"    源条目数：{index['source_total']}")
    print(f"    拼音索引条数：{len(index['pinyin_index'])}")
    print(f"    别名索引条数：{len(index['alias_index'])}")
    print(f"    数字索引条数：{len(index['number_index'])}")
    print(f"    首字母分组数：{len(index['first_letter_groups'])}")


if __name__ == "__main__":
    main()
