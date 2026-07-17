# catalog-pipeline

> 设计文档 14.1 / 修复 E-42、E-31、E-12

`catalog.json` 构建管线：从内嵌天体清单生成规范化目录，覆盖恒星/行星/卫星/矮行星/小行星/彗星/TNO 共 297 条目。

## 入口

```bash
# 默认输出到 data-src/normalized/catalog.json
python tools/catalog-pipeline/build_catalog.py

# 自定义输出路径
python tools/catalog-pipeline/build_catalog.py --out /path/to/catalog.json
```

## 输出

`data-src/normalized/catalog.json`，结构：

```jsonc
{
  "schema": "solar-system-catalog/v1",
  "version": "0.1.0",
  "generated": "smoke",
  "total": 297,
  "type_counts": {
    "asteroid": 21,
    "comet": 4,
    "dwarf-planet": 10,
    "planet": 8,
    "satellite": 248,
    "star": 1,
    "tno": 5
  },
  "bodies": [ /* 297 条目 */ ]
}
```

### 条目分布

| 类型 | 数量 | 说明 |
|------|------|------|
| star | 1 | 太阳 |
| planet | 8 | 水星~海王星 |
| satellite | 248 | 36 命名 + 212 合成（木星 95 / 土星 102 / 天王星 28 / 海王星 16 / 月球与火星卫星 3 / 矮行星卫星 4） |
| dwarf-planet | 10 | 冥王星/阋神星/鸟神星/谷神星/妊神星/亡神星/创神星/塞德娜/Salacia/共工星 |
| asteroid | 21 | 5 真实主带 + 11 合成主带 + 5 近地 |
| comet | 4 | 1P Halley / 2P Encke / 9P Tempel 1 / 67P Churyumov-Gerasimenko |
| tno | 5 | 1992 QB1 / DeeDee / 2015 RR245 / Farout / Dysnomia |

### body_id oneOf integer/string

- 整数：恒星(0)、行星(1-8)、卫星(301-903, 5100+, 6100+, 7100+, 8100+)、矮行星(9-13, 904-908)、小行星(2001-2010, 2200-2211)、TNO(1001-1005)
- 字符串：彗星编号（如 `"1P"`、`"67P"`）

### asset_tier

- `S`：顶级资产（太阳、地球、木星、土星、主要卫星）
- `A`：高质量资产（其他行星、命名卫星、主要矮行星）
- `B`：标准资产（小行星、彗星）
- `C`：合成资产（合成卫星、合成小行星、TNO）

## 辅助函数

### `_cn_num(n: int) -> str`

阿拉伯数字 → 简体中文数字（0-9999）。用于合成卫星中文名编号。

```python
_cn_num(0)   # '零'
_cn_num(13)  # '十三'
_cn_num(42)  # '四十二'
_cn_num(105) # '一百零五'
```

### `_roman(n: int) -> str`

整数 → 罗马数字（1-3999）。用于合成卫星英文名序号。

```python
_roman(1)    # 'I'
_roman(4)    # 'IV'
_roman(2024) # 'MMXXIV'
```

### `_synth_satellites(named: list[tuple]) -> list[tuple]`

在已命名卫星（36 颗）基础上合成未命名卫星，使卫星总数精确达到 248。

合成分布：
- 木星：+88（与 7 命名合计 95）
- 土星：+93（与 9 命名合计 102）
- 天王星：+23（与 5 命名合计 28）
- 海王星：+8（与 8 命名合计 16）

## 验证

```bash
python tools/catalog-pipeline/build_catalog.py
# 期望输出：
#   总条目：297
#   asteroid: 21 / comet: 4 / dwarf-planet: 10 / planet: 8 / satellite: 248 / star: 1 / tno: 5
```

## 依赖

仅 Python 3.9+ 标准库（`argparse`、`json`、`os`、`typing`）。
