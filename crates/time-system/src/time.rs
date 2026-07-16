//! 时间表示、转换与边界（设计文档第 11、12 节）。
//!
//! 内核使用 JD/UTC/TAI/TT/TDB。转换链（设计文档 11.2）：
//!   UTC →(闰秒表)→ TAI →(+32.184s)→ TT →(周期修正)→ TDB
//!
//! 内部轨道计算基于连续时间尺度（TAI/TT/TDB），避免 UTC 跳秒导致轨道不连续。

use crate::leap_seconds::{LeapSecondQuery, LeapSecondTable};
use crate::scale::TimeScale;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// 项目时间范围：1900-01-01 00:00:00 UTC 至 2100-12-31 23:59:59 UTC（设计文档第 2 章）。
pub const TIME_RANGE_MJD_UTC: (f64, f64) = (15020.0, 88128.999988);

/// 时间相关错误。
#[derive(Debug, Clone, PartialEq, Error)]
pub enum TimeError {
    /// 输入时间超出项目支持范围（FR-TIME-007）。
    #[error("时间 {0} (MJD UTC) 超出项目范围 1900-01-01 至 2100-12-31")]
    OutOfRange(f64),
    /// 输入时间尺度与操作不兼容。
    #[error("时间尺度不兼容: {0}")]
    IncompatibleScale(String),
}

/// 时间不确定性标记（设计文档 11.3、FR-TIME-008）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimeUncertainty {
    /// 是否为预测时间转换（未来闰秒未发布）。
    pub predicted: bool,
    /// 是否使用了未来 Delta T 预测。
    pub predicted_delta_t: bool,
}

impl TimeUncertainty {
    /// 已知确定。
    pub fn certain() -> Self {
        Self {
            predicted: false,
            predicted_delta_t: false,
        }
    }
}

/// 约简儒略日（MJD）时间点，携带时间尺度与不确定性。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct JulianDate {
    /// 约简儒略日数值（以该时间尺度的"日"为单位）。
    pub mjd: f64,
    /// 时间尺度。
    pub scale: TimeScale,
    /// 时间不确定性标记。
    pub uncertainty: TimeUncertainty,
}

impl JulianDate {
    /// 构造一个无不确定性的时间点。
    pub fn new(mjd: f64, scale: TimeScale) -> Self {
        Self {
            mjd,
            scale,
            uncertainty: TimeUncertainty::certain(),
        }
    }

    /// 检查该 UTC 时间是否在项目范围内（FR-TIME-007）。
    pub fn check_range(self) -> Result<(), TimeError> {
        if self.scale == TimeScale::Utc
            && (self.mjd < TIME_RANGE_MJD_UTC.0 || self.mjd > TIME_RANGE_MJD_UTC.1)
        {
            return Err(TimeError::OutOfRange(self.mjd));
        }
        Ok(())
    }
}

/// 项目支持的时间范围。
#[derive(Debug, Clone, Copy)]
pub struct TimeRange {
    pub start_mjd_utc: f64,
    pub end_mjd_utc: f64,
}

impl Default for TimeRange {
    fn default() -> Self {
        Self {
            start_mjd_utc: TIME_RANGE_MJD_UTC.0,
            end_mjd_utc: TIME_RANGE_MJD_UTC.1,
        }
    }
}

impl TimeRange {
    /// 判断 UTC MJD 是否在范围内。
    pub fn contains(self, mjd_utc: f64) -> bool {
        mjd_utc >= self.start_mjd_utc && mjd_utc <= self.end_mjd_utc
    }
}

/// TDB 与 TT 之间的周期修正（Fairhead & Bretagnon 简化模型，量级 < 0.002s）。
///
/// 使用经典近似：TDB - TT ≈ 0.001658s * sin(g) + ...，此处采用 IAU 1976 简化项。
/// 对项目精度（核心天体 ≤ 1km）该量级足够（设计文档 16.4 标准档以上）。
fn tdb_minus_tt_seconds(tt_mjd: f64) -> f64 {
    // TT 世纪数（自 J2000.0 MJD=51544.5）
    let t = (tt_mjd - 51544.5) / 36525.0;
    // 地球轨道偏近点角近似（Fairhead-Bretagnon 主项）
    let g = (0.3595362 + 1.7593358e-2 * t).rem_euclid(std::f64::consts::TAU);
    0.001658 * g.sin()
}

/// 时间转换器。
#[derive(Debug, Clone, Default)]
pub struct TimeConverter {
    leap: LeapSecondTable,
}

impl TimeConverter {
    /// 构造自定义闰秒表的转换器（数据包升级时替换，设计文档 11.3）。
    pub fn with_leap_seconds(leap: LeapSecondTable) -> Self {
        Self { leap }
    }

    /// UTC → TAI（应用闰秒表）。
    pub fn utc_to_tai(&self, utc: JulianDate) -> JulianDate {
        debug_assert_eq!(utc.scale, TimeScale::Utc, "utc_to_tai 输入须为 UTC");
        let q: LeapSecondQuery = self.leap.query(utc.mjd);
        let tai_mjd = utc.mjd + q.tai_minus_utc as f64 / 86400.0;
        JulianDate {
            mjd: tai_mjd,
            scale: TimeScale::Tai,
            uncertainty: TimeUncertainty {
                predicted: q.is_predicted,
                predicted_delta_t: false,
            },
        }
    }

    /// TAI → UTC（应用闰秒表逆运算）。
    pub fn tai_to_utc(&self, tai: JulianDate) -> JulianDate {
        debug_assert_eq!(tai.scale, TimeScale::Tai, "tai_to_utc 输入须为 TAI");
        // 闰秒表以 UTC 日期索引；先取粗略 UTC 估计，再精化一次。
        let approx_utc_mjd = tai.mjd - 37.0 / 86400.0;
        let q1 = self.leap.query(approx_utc_mjd);
        let utc_mjd = tai.mjd - q1.tai_minus_utc as f64 / 86400.0;
        let q2 = self.leap.query(utc_mjd);
        JulianDate {
            mjd: utc_mjd,
            scale: TimeScale::Utc,
            uncertainty: TimeUncertainty {
                predicted: q2.is_predicted,
                predicted_delta_t: false,
            },
        }
    }

    /// TAI → TT（TT = TAI + 32.184s，连续）。
    pub fn tai_to_tt(&self, tai: JulianDate) -> JulianDate {
        debug_assert_eq!(tai.scale, TimeScale::Tai, "tai_to_tt 输入须为 TAI");
        JulianDate {
            mjd: tai.mjd + 32.184 / 86400.0,
            scale: TimeScale::Tt,
            uncertainty: tai.uncertainty,
        }
    }

    /// TT → TAI。
    pub fn tt_to_tai(&self, tt: JulianDate) -> JulianDate {
        debug_assert_eq!(tt.scale, TimeScale::Tt, "tt_to_tai 输入须为 TT");
        JulianDate {
            mjd: tt.mjd - 32.184 / 86400.0,
            scale: TimeScale::Tai,
            uncertainty: tt.uncertainty,
        }
    }

    /// TT → TDB（周期修正，连续）。
    pub fn tt_to_tdb(&self, tt: JulianDate) -> JulianDate {
        debug_assert_eq!(tt.scale, TimeScale::Tt, "tt_to_tdb 输入须为 TT");
        JulianDate {
            mjd: tt.mjd + tdb_minus_tt_seconds(tt.mjd) / 86400.0,
            scale: TimeScale::Tdb,
            uncertainty: tt.uncertainty,
        }
    }

    /// TDB → TT。
    pub fn tdb_to_tt(&self, tdb: JulianDate) -> JulianDate {
        debug_assert_eq!(tdb.scale, TimeScale::Tdb, "tdb_to_tt 输入须为 TDB");
        JulianDate {
            mjd: tdb.mjd - tdb_minus_tt_seconds(tdb.mjd) / 86400.0,
            scale: TimeScale::Tt,
            uncertainty: tdb.uncertainty,
        }
    }

    /// 任意尺度 → TDB（星历计算的标准输入）。
    pub fn to_tdb(&self, jd: JulianDate) -> JulianDate {
        match jd.scale {
            TimeScale::Tdb => jd,
            TimeScale::Tt => self.tt_to_tdb(jd),
            TimeScale::Tai => self.tt_to_tdb(self.tai_to_tt(jd)),
            TimeScale::Utc => self.tt_to_tdb(self.tai_to_tt(self.utc_to_tai(jd))),
        }
    }

    /// 任意尺度 → UTC（UI 显示）。
    pub fn to_utc(&self, jd: JulianDate) -> JulianDate {
        match jd.scale {
            TimeScale::Utc => jd,
            TimeScale::Tai => self.tai_to_utc(jd),
            TimeScale::Tt => self.tai_to_utc(self.tt_to_tai(jd)),
            TimeScale::Tdb => self.tai_to_utc(self.tt_to_tai(self.tdb_to_tt(jd))),
        }
    }
}

/// 公历日期分量。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarDate {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

/// 公历日期 → UTC 约简儒略日（有效 1900-2100）。
///
/// 采用标准算法（仅对公历有效）。
pub fn calendar_to_mjd_utc(date: CalendarDate) -> f64 {
    let y = date.year as i64;
    let m = date.month as i64;
    let d = date.day as i64;
    let (y, m) = if m <= 2 { (y - 1, m + 12) } else { (y, m) };
    let a = y / 100;
    let b = 2 - a + a / 4;
    let jd = (365.25 * (y + 4716) as f64).floor()
        + (30.6001 * (m + 1) as f64).floor()
        + d as f64
        + b as f64
        - 1524.5;
    let mjd = jd - 2400000.5;
    let frac =
        (date.hour as f64 * 3600.0 + date.minute as f64 * 60.0 + date.second as f64) / 86400.0;
    mjd + frac
}

/// UTC 约简儒略日 → 公历日期（有效 1900-2100）。
pub fn mjd_utc_to_calendar(mjd: f64) -> CalendarDate {
    // JD 整数部分对应正午；调整到日序算法使用的连续整数日。
    let jd = mjd + 2400000.5;
    let z = jd.floor();
    let f = jd - z;
    // 公历日期算法（Meeus 第 7 章）
    let alpha = ((z - 1867216.25) / 36524.25).floor();
    let a = z + 1.0 + alpha - (alpha / 4.0).floor();
    let b = a + 1524.0;
    let c = ((b - 122.1) / 365.25).floor();
    let d = (365.25 * c).floor();
    let e = ((b - d) / 30.6001).floor();
    let day = b - d - (30.6001 * e).floor();
    let month = if e < 14.0 { e - 1.0 } else { e - 13.0 };
    let year = if month > 2.0 { c - 4716.0 } else { c - 4715.0 };

    let total_secs = f * 86400.0;
    let hour = (total_secs / 3600.0).floor() as u32;
    let minute = ((total_secs - hour as f64 * 3600.0) / 60.0).floor() as u32;
    let second = (total_secs - hour as f64 * 3600.0 - minute as f64 * 60.0).round() as u32;

    CalendarDate {
        year: year as i32,
        month: month as u32,
        day: day as u32,
        hour,
        minute,
        second,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_default_matches_design_doc() {
        let r = TimeRange::default();
        // 1900-01-01 00:00:00 UTC MJD
        let start = calendar_to_mjd_utc(CalendarDate {
            year: 1900,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
        });
        assert!(
            (start - r.start_mjd_utc).abs() < 1e-6,
            "start {start} vs {}",
            r.start_mjd_utc
        );
        assert!(r.contains(start));
    }

    #[test]
    fn out_of_range_rejected() {
        let jd = JulianDate::new(10000.0, TimeScale::Utc);
        assert_eq!(jd.check_range(), Err(TimeError::OutOfRange(10000.0)));
        let jd_ok = JulianDate::new(60000.0, TimeScale::Utc);
        assert!(jd_ok.check_range().is_ok());
    }

    #[test]
    fn utc_tai_roundtrip_j2000() {
        let conv = TimeConverter::default();
        // J2000.0 = 2000-01-01 12:00:00 UTC, MJD = 51544.5
        let utc = JulianDate::new(51544.5, TimeScale::Utc);
        let tai = conv.utc_to_tai(utc);
        // 2000 年 TAI-UTC = 32s
        assert!((tai.mjd - (51544.5 + 32.0 / 86400.0)).abs() < 1e-9);
        let back = conv.tai_to_utc(tai);
        assert!(
            (back.mjd - 51544.5).abs() < 1e-9,
            "roundtrip failed: {}",
            back.mjd
        );
    }

    #[test]
    fn tt_tdb_difference_small() {
        let conv = TimeConverter::default();
        let tt = JulianDate::new(51544.5 + 32.184 / 86400.0, TimeScale::Tt);
        let tdb = conv.tt_to_tdb(tt);
        let diff_days = (tdb.mjd - tt.mjd).abs();
        let diff_secs = diff_days * 86400.0;
        // TDB-TT 量级 < 0.002s
        assert!(diff_secs < 0.002, "TDB-TT = {diff_secs}s");
        let back = conv.tdb_to_tt(tdb);
        assert!((back.mjd - tt.mjd).abs() < 1e-12, "tdb->tt roundtrip");
    }

    #[test]
    fn future_utc_conversion_marked_predicted() {
        let conv = TimeConverter::default();
        // 2050-01-01 UTC MJD ≈ 69796
        let utc = JulianDate::new(69796.0, TimeScale::Utc);
        let tai = conv.utc_to_tai(utc);
        assert!(tai.uncertainty.predicted, "未来闰秒应标记预测");
    }

    #[test]
    fn calendar_mjd_roundtrip() {
        let d = CalendarDate {
            year: 2024,
            month: 4,
            day: 8,
            hour: 18,
            minute: 30,
            second: 0,
        };
        let mjd = calendar_to_mjd_utc(d);
        // 2024-04-08 18:30 UTC MJD ≈ 60408.770833
        assert!((mjd - 60408.770833).abs() < 1e-4, "mjd = {mjd}");
        let back = mjd_utc_to_calendar(mjd);
        assert_eq!(back.year, 2024);
        assert_eq!(back.month, 4);
        assert_eq!(back.day, 8);
    }

    #[test]
    fn to_tdb_from_utc() {
        let conv = TimeConverter::default();
        let utc = JulianDate::new(51544.5, TimeScale::Utc);
        let tdb = conv.to_tdb(utc);
        assert_eq!(tdb.scale, TimeScale::Tdb);
        // TDB ≈ TT ≈ TAI + 32.184 + (32s 闰秒) = UTC + 64.184s 附近
        let expected_approx = 51544.5 + (32.0 + 32.184) / 86400.0;
        assert!((tdb.mjd - expected_approx).abs() < 0.002 / 86400.0 + 1e-9);
    }
}
