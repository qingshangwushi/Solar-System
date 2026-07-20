"""build_ephemeris.py 单元测试（Task 17.1 / 修复 R-08 补充项）。

覆盖：
- read_spk：读取 SPK 文件或回退 Keplerian 合成
- _keplerian_synthesis：合成天体样本
- clip_time_range：时间窗口裁剪
- fit_chebyshev：切比雪夫多项式拟合
- analyze_error：拟合误差分析
- write_compact_binary：紧凑二进制写入格式
- write_report：JSON 报告写出
"""
from __future__ import annotations

import importlib.util
import json
import os
import struct
import sys
from pathlib import Path

import pytest

# ============================================================
# 通过 importlib 加载 build_ephemeris 模块（避免包路径依赖）
# ============================================================
_THIS_DIR = Path(__file__).resolve().parent
_MODULE_PATH = _THIS_DIR / "build_ephemeris.py"

_spec = importlib.util.spec_from_file_location("build_ephemeris", str(_MODULE_PATH))
assert _spec is not None and _spec.loader is not None
be = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(be)


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def tiny_spice_data() -> dict:
    """构造最小化合成数据（2 个天体，每体 8 样本）。"""
    bodies = []
    for bid, name in [(0, "Sun"), (3, "Earth")]:
        samples = []
        for i in range(8):
            mjd = be.MJD_1900 + i * 100.0
            x = float(bid) * 1000.0 + i * 10.0
            y = float(bid) * 2000.0 + i * 5.0
            z = 0.0
            samples.append((mjd, x, y, z))
        bodies.append({
            "body_id": bid,
            "name": name,
            "frame": be.FRAME_HCI,
            "precision": be.PRECISION_P2,
            "samples": samples,
        })
    return {"bodies": bodies}


@pytest.fixture
def fitted_data(tiny_spice_data: dict) -> dict:
    """对 tiny_spice_data 做 3 阶切比雪夫拟合，供 analyze_error 使用。"""
    return be.fit_chebyshev(tiny_spice_data, degree=3)


# ============================================================
# 1. read_spk
# ============================================================

def test_read_spk_none_path_returns_keplerian_fallback() -> None:
    """read_spk(None) 应走 Keplerian 合成，精度 P2。"""
    data = be.read_spk(None)
    assert "bodies" in data
    assert len(data["bodies"]) == len(be.KEPLER_FALLBACK)
    for body in data["bodies"]:
        assert body["precision"] == be.PRECISION_P2
        assert body["frame"] == be.FRAME_HCI
        assert len(body["samples"]) > 0
        # 每个样本是 4 元组 (mjd, x, y, z)
        for sample in body["samples"]:
            assert len(sample) == 4


def test_read_spk_nonexistent_file_falls_back() -> None:
    """不存在的 SPK 路径应回退到 Keplerian 合成（不应抛异常）。"""
    data = be.read_spk("/tmp/__nonexistent_spk_file__.bsp")
    assert len(data["bodies"]) == len(be.KEPLER_FALLBACK)


def test_read_spk_with_daf_magic_uses_p3(tmp_path) -> None:
    """文件以 DAF/SPK magic 开头时，应标记精度为 P3。"""
    spk_path = tmp_path / "fake.bsp"
    spk_path.write_bytes(b"DAF/SPK" + b"\x00" * 64)
    data = be.read_spk(str(spk_path))
    for body in data["bodies"]:
        assert body["precision"] == be.PRECISION_P3


def test_read_spk_sun_body_at_origin() -> None:
    """太阳（body_id=0）样本应在原点 (0,0,0)。"""
    data = be.read_spk(None)
    sun = next(b for b in data["bodies"] if b["body_id"] == 0)
    for _mjd, x, y, z in sun["samples"]:
        assert x == 0.0
        assert y == 0.0
        assert z == 0.0


# ============================================================
# 2. _keplerian_synthesis / _sample_times
# ============================================================

def test_keplerian_synthesis_returns_all_bodies() -> None:
    """_keplerian_synthesis 应覆盖全部 KEPLER_FALLBACK 天体。"""
    data = be._keplerian_synthesis(be.PRECISION_P2)
    ids = [b["body_id"] for b in data["bodies"]]
    expected_ids = [entry[0] for entry in be.KEPLER_FALLBACK]
    assert ids == expected_ids


def test_sample_times_n_points_in_range() -> None:
    """_sample_times 在 [MJD_1900, MJD_2100] 内等距采样 n 点。"""
    times = be._sample_times(365.0, n=8)
    assert len(times) == 8
    assert times[0] == be.MJD_1900
    assert times[-1] == be.MJD_2100


def test_sample_times_n_le_one() -> None:
    """n<=1 时只返回单个起点。"""
    times = be._sample_times(100.0, n=1)
    assert times == [be.MJD_1900]


# ============================================================
# 3. clip_time_range
# ============================================================

def test_clip_time_range_filters_samples(tiny_spice_data: dict) -> None:
    """clip_time_range 仅保留落在窗口内的样本。"""
    start = be.MJD_1900 + 150.0
    end = be.MJD_1900 + 450.0
    clipped = be.clip_time_range(tiny_spice_data, start, end)
    for body in clipped["bodies"]:
        for sample in body["samples"]:
            assert start <= sample[0] <= end


def test_clip_time_range_empty_window_keeps_endpoints(tiny_spice_data: dict) -> None:
    """窗口内无样本时，应保留首末两点兜底。"""
    # 所有样本都在 [15020, 15720]，给一个完全错开的窗口
    clipped = be.clip_time_range(tiny_spice_data, 80000.0, 90000.0)
    for body in clipped["bodies"]:
        assert len(body["samples"]) >= 2  # 至少首末两点


# ============================================================
# 4. fit_chebyshev
# ============================================================

def test_fit_chebyshev_segments_count(tiny_spice_data: dict) -> None:
    """fit_chebyshev 自适应分段，段长 ≤ 365 天（E-43 修复）。

    tiny_spice_data 的 8 样本跨越 700 天（MJD_1900..MJD_1900+700），
    按 365 天上限自适应分段 → 2 段（ceil(700/365) = 2）。
    每段系数长度 = degree + 1（样本不足时降阶）。
    """
    fitted = be.fit_chebyshev(tiny_spice_data, degree=3)
    for body in fitted["bodies"]:
        # 700 天跨度 / 365 天上限 → 2 段（自适应分段，修复 E-43 切比雪夫发散）
        assert len(body["segments"]) == 2
        for seg in body["segments"]:
            # 三分量系数长度一致；样本不足时降阶，长度 >= 1
            assert len(seg["coef_x"]) == len(seg["coef_y"]) == len(seg["coef_z"])
            assert len(seg["coef_x"]) >= 1
            assert seg["t_start"] <= seg["t_end"]
            assert seg["samples_used"] >= 1
            # 段长不超过 365 天上限
            assert (seg["t_end"] - seg["t_start"]) <= 365.0 + 1e-6


def test_fit_chebyshev_enough_samples_keeps_degree() -> None:
    """样本足够多时，系数长度应等于 degree + 1（不降阶）。"""
    # 每段至少 degree+2=5 个样本，4 段需 >= 20 样本
    samples = [(float(i), float(i) * 1.5, float(i) * 0.5, 0.0) for i in range(40)]
    spice = {"bodies": [{
        "body_id": 99,
        "name": "Dense",
        "frame": be.FRAME_HCI,
        "precision": be.PRECISION_P2,
        "samples": samples,
    }]}
    fitted = be.fit_chebyshev(spice, degree=3)
    body = fitted["bodies"][0]
    for seg in body["segments"]:
        assert len(seg["coef_x"]) == 4
        assert len(seg["coef_y"]) == 4
        assert len(seg["coef_z"]) == 4


def test_fit_chebyshev_constant_signal() -> None:
    """对常量信号拟合，T_0 系数应等于常量值，其他系数接近 0。"""
    samples = [(float(i), 5.0, -3.0, 2.0) for i in range(20)]
    spice = {"bodies": [{
        "body_id": 99,
        "name": "Const",
        "frame": be.FRAME_HCI,
        "precision": be.PRECISION_P2,
        "samples": samples,
    }]}
    fitted = be.fit_chebyshev(spice, degree=3)
    body = fitted["bodies"][0]
    # 求值时无论哪个段，结果都应接近常量
    for seg in body["segments"]:
        mid = 0.5 * (seg["t_start"] + seg["t_end"])
        x, y, z = be._eval_body_at(body, mid)
        assert abs(x - 5.0) < 1e-6
        assert abs(y - (-3.0)) < 1e-6
        assert abs(z - 2.0) < 1e-6


def test_fit_chebyshev_linear_signal() -> None:
    """对线性信号 y = 2*t 拟合，求值应能恢复线性关系。"""
    samples = [(float(t), 2.0 * t, 0.0, 0.0) for t in range(20)]
    spice = {"bodies": [{
        "body_id": 99,
        "name": "Linear",
        "frame": be.FRAME_HCI,
        "precision": be.PRECISION_P2,
        "samples": samples,
    }]}
    fitted = be.fit_chebyshev(spice, degree=3)
    body = fitted["bodies"][0]
    # 取段中点验证
    for seg in body["segments"]:
        mid_t = 0.5 * (seg["t_start"] + seg["t_end"])
        x, _y, _z = be._eval_body_at(body, mid_t)
        assert abs(x - 2.0 * mid_t) < 1e-6


def test_fit_chebyshev_empty_bodies() -> None:
    """空 bodies 输入应返回空列表。"""
    fitted = be.fit_chebyshev({"bodies": []}, degree=3)
    assert fitted["bodies"] == []


# ============================================================
# 5. analyze_error
# ============================================================

def test_analyze_error_zero_for_exact_fit(fitted_data: dict, tiny_spice_data: dict) -> None:
    """若拟合精确还原参考样本，误差应为 0（这里仅验证结构，数值小）。"""
    report = be.analyze_error(fitted_data, tiny_spice_data)
    assert "bodies" in report
    assert "overall_max_error_km" in report
    assert "overall_mean_error_km" in report
    assert "body_count" in report
    assert report["body_count"] == len(fitted_data["bodies"])
    for body_report in report["bodies"]:
        assert body_report["max_error_km"] >= 0.0
        assert body_report["mean_error_km"] >= 0.0
        assert body_report["p95_error_km"] >= 0.0
        assert body_report["max_error_km"] >= body_report["mean_error_km"]


def test_analyze_error_missing_reference_body(fitted_data: dict) -> None:
    """参考数据缺失某天体时，该天体在报告中应被跳过。"""
    reference = {"bodies": [b for b in fitted_data["bodies"] if b["body_id"] != 0]}
    report = be.analyze_error(fitted_data, reference)
    ids_in_report = {b["body_id"] for b in report["bodies"]}
    assert 0 not in ids_in_report


def test_analyze_error_empty_input() -> None:
    """空输入应返回空报告且不抛异常。"""
    report = be.analyze_error({"bodies": []}, {"bodies": []})
    assert report["body_count"] == 0
    assert report["overall_max_error_km"] == 0.0
    assert report["overall_mean_error_km"] == 0.0


# ============================================================
# 6. write_compact_binary
# ============================================================

def test_write_compact_binary_format(tmp_path, fitted_data: dict) -> None:
    """write_compact_binary 输出格式应与设计文档一致。"""
    body = fitted_data["bodies"][0]
    out_path = tmp_path / "ephemeris-0.bin"
    index = {
        "body_id": body["body_id"],
        "frame": body["frame"],
        "precision": body["precision"],
    }
    be.write_compact_binary(body, index, str(out_path))
    assert out_path.exists()

    with open(out_path, "rb") as f:
        data = f.read()

    # 校验 magic + version
    assert data[:4] == be.MAGIC
    version = struct.unpack("<I", data[4:8])[0]
    assert version == be.VERSION

    # 校验 body_id / frame / precision
    body_id = struct.unpack("<Q", data[8:16])[0]
    frame = data[16]
    precision = data[17]
    assert body_id == body["body_id"]
    assert frame == body["frame"]
    assert precision == body["precision"]

    # 校验段数
    seg_count = struct.unpack("<I", data[18:22])[0]
    assert seg_count == len(body["segments"])

    # 逐段解析
    offset = 22
    for seg in body["segments"]:
        t_start, t_end = struct.unpack("<dd", data[offset:offset + 16])
        offset += 16
        n = struct.unpack("<I", data[offset:offset + 4])[0]
        offset += 4
        # 读取 x/y/z 三组系数
        size = n * 8
        coef_x = list(struct.unpack(f"<{n}d", data[offset:offset + size]))
        offset += size
        coef_y = list(struct.unpack(f"<{n}d", data[offset:offset + size]))
        offset += size
        coef_z = list(struct.unpack(f"<{n}d", data[offset:offset + size]))
        offset += size
        assert t_start == pytest.approx(seg["t_start"])
        assert t_end == pytest.approx(seg["t_end"])
        # 三分量长度对齐
        expected_len = max(len(seg["coef_x"]), len(seg["coef_y"]), len(seg["coef_z"]))
        assert n == expected_len
        assert len(coef_x) == expected_len
        assert len(coef_y) == expected_len
        assert len(coef_z) == expected_len


def test_write_compact_binary_creates_parent_dir(tmp_path, fitted_data: dict) -> None:
    """输出目录不存在时应自动创建。"""
    body = fitted_data["bodies"][0]
    out_path = tmp_path / "nested" / "dir" / "ephemeris.bin"
    be.write_compact_binary(body, {
        "body_id": body["body_id"],
        "frame": body["frame"],
        "precision": body["precision"],
    }, str(out_path))
    assert out_path.exists()


# ============================================================
# 7. write_report
# ============================================================

def test_write_report_json_roundtrip(tmp_path) -> None:
    """write_report 写出的 JSON 应能被 json.load 正确读回。"""
    report = {
        "schema": "solar-system-ephemeris-report/v1",
        "overall_max_error_km": 1.23,
        "bodies": [{"body_id": 0, "max_error_km": 1.23}],
    }
    out_path = tmp_path / "nested" / "report.json"
    be.write_report(report, str(out_path))
    assert out_path.exists()
    with open(out_path, "r", encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded["schema"] == report["schema"]
    assert loaded["overall_max_error_km"] == pytest.approx(1.23)
    assert loaded["bodies"][0]["body_id"] == 0


# ============================================================
# 8. _chebyshev_eval / _eval_body_at
# ============================================================

def test_chebyshev_eval_constant_coef() -> None:
    """常数系数 [c] 应返回 c。"""
    assert be._chebyshev_eval([5.0], 0.5) == pytest.approx(5.0)
    assert be._chebyshev_eval([5.0], -0.5) == pytest.approx(5.0)


def test_chebyshev_eval_linear_coef() -> None:
    """T_0=1, T_1=x，所以 [c0, c1] 应得 c0 + c1*x。"""
    for x in (-1.0, -0.5, 0.0, 0.5, 1.0):
        val = be._chebyshev_eval([2.0, 3.0], x)
        assert val == pytest.approx(2.0 + 3.0 * x)


def test_chebyshev_eval_empty() -> None:
    """空系数应返回 0。"""
    assert be._chebyshev_eval([], 0.5) == 0.0


def test_eval_body_at_out_of_range_uses_nearest_endpoint(fitted_data: dict) -> None:
    """mjd 超出所有段范围时，应使用最近段在端点 x=0 处求值（按实现约定）。"""
    body = fitted_data["bodies"][0]
    segs = body["segments"]
    early_mjd = segs[0]["t_start"] - 1000.0
    x, _y, _z = be._eval_body_at(body, early_mjd)
    # 实现约定：mjd < segs[0].t_start 时取 segs[0] 且 x=0.0
    expected_x = be._chebyshev_eval(segs[0]["coef_x"], 0.0)
    assert x == pytest.approx(expected_x)

    late_mjd = segs[-1]["t_end"] + 1000.0
    x2, _y2, _z2 = be._eval_body_at(body, late_mjd)
    expected_x2 = be._chebyshev_eval(segs[-1]["coef_x"], 1.0)
    assert x2 == pytest.approx(expected_x2)
