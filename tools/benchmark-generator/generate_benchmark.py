#!/usr/bin/env python3
"""benchmark 生成管线（设计文档 14.5 / 修复 E-42）。

生成性能基准定义文件 `benchmark.json`，包含若干场景的帧率/内存/draw call 目标值，
供 CI 性能回归与本地 Profiling 使用。

场景：
- idle：静止视角，地球+月球
- cruise：巡航视角，太阳系全景
- terrain：地表模式，高 LOD 地形
- events：事件回放，多粒子特效
- stress：压力测试，全部 297 体 + 最大粒子

输出 schema：solar-system-benchmark/v1

用法：
    python tools/benchmark-generator/generate_benchmark.py [--out data-src/normalized/benchmark.json]
"""
from __future__ import annotations

import argparse
import json
import os
from typing import Any


# 性能等级阈值（FPS）
PERF_TIERS = {
    "ultra": 120,
    "high": 60,
    "medium": 30,
    "low": 15,
}

# 内存预算（MB）
MEM_BUDGET_MB = {
    "ultra": 2048,
    "high": 1024,
    "medium": 512,
    "low": 256,
}

# Draw call 预算
DRAW_CALL_BUDGET = {
    "ultra": 4000,
    "high": 2000,
    "medium": 1000,
    "low": 500,
}

# 三角形预算（百万）
TRIANGLE_BUDGET_M = {
    "ultra": 50.0,
    "high": 20.0,
    "medium": 8.0,
    "low": 2.0,
}


def _build_scene(
    scene_id: str,
    name_cn: str,
    description: str,
    bodies: int,
    particles: int,
    lod_bias: float,
    shadow_cascades: int,
) -> dict[str, Any]:
    """构建单个 benchmark 场景定义。"""
    targets: dict[str, Any] = {}
    for tier, fps in PERF_TIERS.items():
        targets[tier] = {
            "min_fps": fps,
            "max_frame_time_ms": round(1000.0 / fps, 2),
            "max_memory_mb": MEM_BUDGET_MB[tier],
            "max_draw_calls": DRAW_CALL_BUDGET[tier],
            "max_triangles_m": TRIANGLE_BUDGET_M[tier],
            "post_processing": tier != "low",
        }
    return {
        "scene_id": scene_id,
        "name_cn": name_cn,
        "description": description,
        "config": {
            "bodies": bodies,
            "particles": particles,
            "lod_bias": lod_bias,
            "shadow_cascades": shadow_cascades,
            "vsync": True,
        },
        "targets": targets,
        "duration_seconds": 30,
        "warmup_seconds": 3,
    }


def build_benchmark() -> dict[str, Any]:
    """构建完整 benchmark 定义对象。"""
    scenes = [
        _build_scene(
            "idle", "静止视角",
            "静止相机，仅地球+月球+太阳光照",
            bodies=3, particles=0, lod_bias=0.0, shadow_cascades=1,
        ),
        _build_scene(
            "cruise", "巡航视角",
            "太阳系全景巡航，8 大行星 + 主要卫星",
            bodies=20, particles=5000, lod_bias=1.0, shadow_cascades=2,
        ),
        _build_scene(
            "terrain", "地表模式",
            "高 LOD 地形渲染，单行星表面",
            bodies=1, particles=2000, lod_bias=-1.0, shadow_cascades=4,
        ),
        _build_scene(
            "events", "事件回放",
            "多粒子特效与时间线事件回放",
            bodies=10, particles=50000, lod_bias=0.5, shadow_cascades=2,
        ),
        _build_scene(
            "stress", "压力测试",
            "全部 297 体 + 最大粒子负载",
            bodies=297, particles=100000, lod_bias=2.0, shadow_cascades=1,
        ),
    ]

    return {
        "schema": "solar-system-benchmark/v1",
        "version": "0.1.0",
        "generated": "smoke",
        "tiers": list(PERF_TIERS.keys()),
        "tier_thresholds": {
            "fps": PERF_TIERS,
            "memory_mb": MEM_BUDGET_MB,
            "draw_calls": DRAW_CALL_BUDGET,
            "triangles_m": TRIANGLE_BUDGET_M,
        },
        "scenes": scenes,
        "total_scenes": len(scenes),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 benchmark.json")
    parser.add_argument("--out", default=None,
                        help="输出路径（默认：data-src/normalized/benchmark.json）")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out_path = os.path.abspath(args.out) if args.out else \
        os.path.join(project_root, "data-src", "normalized", "benchmark.json")

    benchmark = build_benchmark()

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(benchmark, f, ensure_ascii=False, indent=2)

    print(f"==> benchmark.json 已生成：{out_path}")
    print(f"    场景数：{benchmark['total_scenes']}")
    for scene in benchmark["scenes"]:
        print(f"    - {scene['scene_id']}：{scene['name_cn']}（{scene['config']['bodies']} 体 / {scene['config']['particles']} 粒子）")
    print(f"    性能等级：{', '.join(benchmark['tiers'])}")


if __name__ == "__main__":
    main()
