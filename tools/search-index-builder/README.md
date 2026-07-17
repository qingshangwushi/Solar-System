# search-index-builder

> 设计文档 14.4 / 修复 E-42

`search-index.json` 构建管线：从 `catalog.json` 派生 4 类检索索引，支持拼音、别名、编号、首字母分组搜索。

## 入口

```bash
# 默认读取 data-src/normalized/catalog.json，输出 data-src/normalized/search-index.json
python tools/search-index-builder/build_search_index.py

# 自定义路径
python tools/search-index-builder/build_search_index.py \
    --catalog /path/to/catalog.json \
    --out /path/to/search-index.json
```

## 输出

`data-src/normalized/search-index.json`，结构：

```jsonc
{
  "schema": "solar-system-search-index/v1",
  "version": "0.1.0",
  "generated": "smoke",
  "source_total": 297,
  "pinyin_index": {
    "taiyang": [0],
    "shuixing": [1],
    "muweiyi": [501],
    /* ... 58 体的中文拼音 */
  },
  "alias_index": {
    "太阳": [0], "sun": [0], "0": [0],
    "地球": [3], "earth": [3], "tellus": [3], "terra": [3], "3": [3],
    /* ... */
  },
  "number_index": {
    "0": [0], "1": [1], "301": [301], "2001": [2001],
    /* ... 所有数字 body_id 字符串 */
  },
  "first_letter_groups": {
    "S": [0, 5, 6, /* ... */],
    "M": [3, 4, /* ... */],
    /* ... */
  }
}
```

### 4 类索引

| 索引 | 键 | 值 | 用途 |
|------|-----|-----|------|
| pinyin_index | 拼音（无空格小写） | body_id 列表 | 中文输入"水星"→"shuixing"命中 |
| alias_index | 别名规范化字符串 | body_id 列表 | 中英文/编号/已知别名命中 |
| number_index | 阿拉伯数字字符串 | body_id 列表 | 输入 "301" 直接定位月球 |
| first_letter_groups | 英文名首字母（大写） | body_id 列表 | 按字母快速浏览（A-Z + #） |

## 辅助函数

### `_pinyin_of(cn: str) -> str | None`

把中文天体名映射到拼音（无空格小写）。内置 58 体汉字→拼音表。未命中返回 None（合成体用 body_id 兜底）。

```python
_pinyin_of("太阳")   # 'taiyang'
_pinyin_of("木卫一") # 'muweiyi'
_pinyin_of("冥王星") # 'mingwangxing'
```

### `_normalize(s: str) -> str`

统一小写、去空格、去标点（`-`、`_`、`,`、`.`、`·`、`/`）。

```python
_normalize("Halley's Comet")  # 'halley'scomet' -> 'halleyscomet'
_normalize("丘留莫夫-格拉西缅科")  # '丘留莫夫格拉西缅科'
```

### `_first_letter(en: str) -> str`

取英文名首字母（大写）。空串或非字母返回 `'#'`。

## 拼音表覆盖范围

58 体覆盖：
- 1 恒星（太阳）
- 8 行星
- 36 真实命名卫星（月球、火卫一/二、木卫一~七、土卫一~九、天卫一~五、海卫一~八、冥卫一~三、亡神卫一）
- 10 矮行星（含 Salacia 等价空字符串，由 alias_index 兜底）
- 7 主要小行星（灶神/智神/健神/虹神/花神/爱神/丝神）
- 2 彗星（哈雷/恩克）

合成卫星/合成小行星/TNO 的拼音不在表中，由 alias_index 的 body_id 字符串兜底检索。

## 验证

```bash
python tools/search-index-builder/build_search_index.py
# 期望输出：
#   源条目数：297
#   拼音索引条数：58（覆盖 58 体）
#   别名索引条数：>800（每体多条别名）
#   数字索引条数：>250
#   首字母分组数：~27（A-Z + #）
```

## 依赖

仅 Python 3.9+ 标准库（`argparse`、`json`、`os`、`re`、`typing`）。
