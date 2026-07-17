# benchmark-generator

> 设计文档 14.5 / 修复 E-42

`benchmark.json` 生成管线：为 CI 性能回归与本地 Profiling 生成场景定义与目标阈值。

## 入口

```bash
# 默认输出到 data-src/normalized/benchmark.json
python tools/benchmark-generator/generate_benchmark.py

# 自定义输出路径
python tools/benchmark-generator/generate_benchmark.py --out /path/to/benchmark.json
```

## 输出

`data-src/normalized/benchmark.json`，结构：

```jsonc
{
  "schema": "solar-system-benchmark/v1",
  "version": "0.1.0",
  "generated": "smoke",
  "tiers": ["ultra", "high", "medium", "low"],
  "tier_thresholds": {
    "fps":          { "ultra": 120, "high": 60, "medium": 30, "low": 15 },
    "memory_mb":    { "ultra": 2048, "high": 1024, "medium": 512, "low": 256 },
    "draw_calls":   { "ultra": 4000, "high": 2000, "medium": 1000, "low": 500 },
    "triangles_m":  { "ultra": 50.0, "high": 20.0, "medium": 8.0, "low": 2.0 }
  },
  "scenes": [
    {
      "scene_id": "idle",
      "name_cn": "静止视角",
      "description": "静止相机，仅地球+月球+太阳光照",
      "config": { "bodies": 3, "particles": 0, "lod_bias": 0.0, "shadow_cascades": 1, "vsync": true },
      "targets": {
        "ultra":  { "min_fps": 120, "max_frame_time_ms": 8.33, "max_memory_mb": 2048, /* ... */ },
        "high":   { "min_fps": 60,  /* ... */ },
        "medium": { "min_fps": 30,  /* ... */ },
        "low":    { "min_fps": 15,  /* ... */ }
      },
      "duration_seconds": 30,
      "warmup_seconds": 3
    }
    /* cruise / terrain / events / stress */
  ],
  "total_scenes": 5
}
```

## 场景

| scene_id | 名称 | bodies | particles | lod_bias | shadow_cascades | 说明 |
|----------|------|--------|-----------|----------|-----------------|------|
| idle | 静止视角 | 3 | 0 | 0.0 | 1 | 地球+月球+太阳光照，最轻量 |
| cruise | 巡航视角 | 20 | 5000 | 1.0 | 2 | 太阳系全景巡航 |
| terrain | 地表模式 | 1 | 2000 | -1.0 | 4 | 高 LOD 地形 |
| events | 事件回放 | 10 | 50000 | 0.5 | 2 | 多粒子特效 |
| stress | 压力测试 | 297 | 100000 | 2.0 | 1 | 全部 297 体 + 最大粒子 |

## 性能等级阈值

| 等级 | min_fps | max_memory_mb | max_draw_calls | max_triangles_m |
|------|---------|---------------|----------------|-----------------|
| ultra | 120 | 2048 | 4000 | 50.0 |
| high | 60 | 1024 | 2000 | 20.0 |
| medium | 30 | 512 | 1000 | 8.0 |
| low | 15 | 256 | 500 | 2.0 |

## 辅助函数

### `_build_scene(scene_id, name_cn, description, bodies, particles, lod_bias, shadow_cascades) -> dict`

构建单个 benchmark 场景定义。自动为 4 个性能等级生成目标值。

```python
_build_scene("idle", "静止视角", "...", bodies=3, particles=0, lod_bias=0.0, shadow_cascades=1)
```

## 验证

```bash
python tools/benchmark-generator/generate_benchmark.py
# 期望输出：
#   场景数：5
#   - idle：静止视角（3 体 / 0 粒子）
#   - cruise：巡航视角（20 体 / 5000 粒子）
#   - terrain：地表模式（1 体 / 2000 粒子）
#   - events：事件回放（10 体 / 50000 粒子）
#   - stress：压力测试（297 体 / 100000 粒子）
#   性能等级：ultra, high, medium, low
```

## 依赖

仅 Python 3.9+ 标准库（`argparse`、`json`、`os`、`typing`）。
