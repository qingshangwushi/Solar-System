# ephemeris-pipeline

> 设计文档 14.2 / 修复 E-12、E-42

星历构建管线：SPK → 1900-2100 裁剪 → 切比雪夫拟合 → 紧凑二进制 + 索引 + 校验报告。

## 入口

```bash
# 默认走 Keplerian 回退，输出到 data-src/normalized/
python tools/ephemeris-pipeline/build_ephemeris.py

# 指定 SPK 内核文件（DAF/SPK 格式）与切比雪夫阶数
python tools/ephemeris-pipeline/build_ephemeris.py \
    --spk /path/to/de440s.bsp \
    --degree 9 \
    --out-dir /path/to/output
```

## 输出

- `data-src/normalized/ephemeris-{bodyId}.bin`：紧凑二进制星历文件，每个天体一个
- `data-src/normalized/ephemeris-report.json`：校验报告

### 紧凑二进制布局（小端 LE）

| 字段 | 类型 | 说明 |
|------|------|------|
| magic | 4 bytes | `b"SSPH"` |
| version | u32 LE | `1` |
| body_id | u64 LE | 天体编号 |
| frame | u8 | ReferenceFrame 变体序号（1=HCI, 2=BC, ...） |
| precision | u8 | Precision 变体序号（0=P0 ... 4=P4） |
| segment_count | u32 LE | 段数 |
| 每段：t_start | f64 LE | 区间起点（MJD TDB） |
| 每段：t_end | f64 LE | 区间终点 |
| 每段：coef_count | u32 LE | x/y/z 共用同一长度 |
| 每段：coef_x | coef_count * f64 LE | X 分量系数 |
| 每段：coef_y | coef_count * f64 LE | Y 分量系数 |
| 每段：coef_z | coef_count * f64 LE | Z 分量系数 |

## 管线阶段

### 1. `read_spk(path: str | None) -> dict`

读取 NAIF SPK 内核文件。优先解析 DAF/SPK 头；非 SPK 或 path 为 None 时回退到基于 catalog 的 Keplerian 合成样本。

回退策略：内置 8 大行星 + 太阳 + 月球 的 Keplerian 根数表，在 [MJD 15020, MJD 88069]（1900-2100）内等距采样 64 点。

```python
data = read_spk(None)  # Keplerian 回退
data = read_spk("/path/to/de440s.bsp")  # 真实 SPK（精度 P3）
```

### 2. `clip_time_range(spice_data, start_mjd, end_mjd) -> dict`

裁剪时间范围至 [start_mjd, end_mjd]。仅保留窗口内样本；若某天体样本全部落外则保留首末两点防止空段。

### 3. `fit_chebyshev(segments, degree) -> dict`

对每个天体的样本分段切比雪夫拟合。默认按时间均匀切 4 段，每段做 `degree` 阶最小二乘拟合（正规方程 + 高斯消元）。

返回每段的 `t_start/t_end/coef_x/coef_y/coef_z`（长度均为 degree+1）。

### 4. `analyze_error(fitted, reference) -> dict`

在参考样本点处用切比雪夫系数重新求值（Clenshaw 算法），与原样本位置对比，统计：

- `max_error_km`：单天体最大误差
- `mean_error_km`：单天体平均误差
- `p95_error_km`：单天体 95 分位误差
- `overall_max_error_km` / `overall_mean_error_km`：全局统计

### 5. `write_compact_binary(coef, index, out_path) -> None`

按上述紧凑二进制布局写出。三分量长度对齐（不足补 0）。

### 6. `write_report(report, out_path) -> None`

写出 JSON 校验报告，包含 spk_source、time_range_mjd、chebyshev_degree、segments_per_body、bodies_written、error_analysis。

## 默认 smoke 数据集

无 `--spk` 参数时，生成 10 个天体的 smoke 数据集：

| bodyId | 名称 | 数据源 |
|--------|------|--------|
| 0 | Sun | Keplerian 原点 |
| 1 | Mercury | Keplerian |
| 2 | Venus | Keplerian |
| 3 | Earth | Keplerian |
| 4 | Mars | Keplerian |
| 5 | Jupiter | Keplerian |
| 6 | Saturn | Keplerian |
| 7 | Uranus | Keplerian |
| 8 | Neptune | Keplerian |
| 301 | Moon | Keplerian + Earth 位置 |

精度等级 P2（计算模型）；切比雪夫阶数 7；每体 4 段。

## 验证

```bash
python tools/ephemeris-pipeline/build_ephemeris.py
# 期望输出：
#   读取/合成天体数：10
#   裁剪后总样本数：584
#   总段数：40
#   写出 ephemeris-{0..8,301}.bin
#   报告写出 ephemeris-report.json
```

## 与 Rust 运行时兼容

二进制布局与 `crates/ephemeris-runtime/src/chebyshev.rs` 的 `ChebyshevSegment`、`crates/ephemeris-runtime/src/provider.rs` 的 `BodyEphemeris` 字段对齐：

- `frame` 字节对应 `ReferenceFrame` 枚举变体序号
- `precision` 字节对应 `Precision` 枚举变体序号
- 段内 `coef_count` 三分量共用，匹配 `coef_x/coef_y/coef_z: Vec<f64>` 的长度

## 依赖

仅 Python 3.9+ 标准库（`argparse`、`json`、`math`、`os`、`struct`、`typing`）。
