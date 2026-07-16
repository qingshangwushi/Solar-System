//! 闰秒表（设计文档 11.3）
//!
//! 离线包含发布时最新闰秒表；当前日期之前使用正式闰秒；
//! 未来日期在未发布新闰秒时采用"最后已知表 + 预测 Delta T"策略并返回不确定性标记。

use serde::{Deserialize, Serialize};

/// 闰秒条目：自该 UTC 时刻起，TAI - UTC 增加 1 秒。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LeapSecondEntry {
    /// 该闰秒生效的 UTC 日期（公历，UTC 午夜），以约简儒略日表示。
    pub mjd_utc: i64,
    /// 生效后 TAI - UTC 的累计秒数。
    pub tai_minus_utc: i64,
}

/// 闰秒查询结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LeapSecondQuery {
    /// 当前 TAI - UTC 秒数。
    pub tai_minus_utc: i64,
    /// 是否为预测（未来日期未发布正式闰秒）。
    pub is_predicted: bool,
}

/// 已知正式闰秒表（截至 2017-01-01，TAI-UTC = 37s）。
///
/// 来源：IERS / NASA Goddard Leap Seconds 表。
/// 数据包升级时可替换此表，不修改内核（设计文档 11.3）。
const OFFICIAL_LEAP_SECONDS: &[LeapSecondEntry] = &[
    LeapSecondEntry {
        mjd_utc: 41317,
        tai_minus_utc: 10,
    }, // 1972-01-01
    LeapSecondEntry {
        mjd_utc: 41499,
        tai_minus_utc: 11,
    }, // 1972-07-01
    LeapSecondEntry {
        mjd_utc: 41683,
        tai_minus_utc: 12,
    }, // 1973-01-01
    LeapSecondEntry {
        mjd_utc: 42048,
        tai_minus_utc: 13,
    }, // 1974-01-01
    LeapSecondEntry {
        mjd_utc: 42413,
        tai_minus_utc: 14,
    }, // 1975-01-01
    LeapSecondEntry {
        mjd_utc: 42778,
        tai_minus_utc: 15,
    }, // 1976-01-01
    LeapSecondEntry {
        mjd_utc: 43144,
        tai_minus_utc: 16,
    }, // 1977-01-01
    LeapSecondEntry {
        mjd_utc: 43509,
        tai_minus_utc: 17,
    }, // 1978-01-01
    LeapSecondEntry {
        mjd_utc: 43874,
        tai_minus_utc: 18,
    }, // 1979-01-01
    LeapSecondEntry {
        mjd_utc: 44239,
        tai_minus_utc: 19,
    }, // 1980-01-01
    LeapSecondEntry {
        mjd_utc: 44786,
        tai_minus_utc: 20,
    }, // 1981-07-01
    LeapSecondEntry {
        mjd_utc: 45151,
        tai_minus_utc: 21,
    }, // 1982-07-01
    LeapSecondEntry {
        mjd_utc: 45516,
        tai_minus_utc: 22,
    }, // 1983-07-01
    LeapSecondEntry {
        mjd_utc: 46247,
        tai_minus_utc: 23,
    }, // 1985-07-01
    LeapSecondEntry {
        mjd_utc: 47161,
        tai_minus_utc: 24,
    }, // 1988-01-01
    LeapSecondEntry {
        mjd_utc: 47892,
        tai_minus_utc: 25,
    }, // 1990-01-01
    LeapSecondEntry {
        mjd_utc: 48257,
        tai_minus_utc: 26,
    }, // 1991-01-01
    LeapSecondEntry {
        mjd_utc: 48804,
        tai_minus_utc: 27,
    }, // 1992-07-01
    LeapSecondEntry {
        mjd_utc: 49169,
        tai_minus_utc: 28,
    }, // 1993-07-01
    LeapSecondEntry {
        mjd_utc: 49534,
        tai_minus_utc: 29,
    }, // 1994-07-01
    LeapSecondEntry {
        mjd_utc: 50083,
        tai_minus_utc: 30,
    }, // 1996-01-01
    LeapSecondEntry {
        mjd_utc: 50630,
        tai_minus_utc: 31,
    }, // 1997-07-01
    LeapSecondEntry {
        mjd_utc: 51179,
        tai_minus_utc: 32,
    }, // 1999-01-01
    LeapSecondEntry {
        mjd_utc: 53736,
        tai_minus_utc: 33,
    }, // 2006-01-01
    LeapSecondEntry {
        mjd_utc: 54832,
        tai_minus_utc: 34,
    }, // 2009-01-01
    LeapSecondEntry {
        mjd_utc: 56109,
        tai_minus_utc: 35,
    }, // 2012-07-01
    LeapSecondEntry {
        mjd_utc: 57204,
        tai_minus_utc: 36,
    }, // 2015-07-01
    LeapSecondEntry {
        mjd_utc: 57754,
        tai_minus_utc: 37,
    }, // 2017-01-01
];

/// 最后已知正式闰秒生效日期的约简儒略日（UTC 午夜）。
const LAST_OFFICIAL_LEAP_MJD: i64 = 57754; // 2017-01-01

/// 数据基线日期（设计文档基线 2026-07-16）的 UTC 约简儒略日。
///
/// 设计文档 11.3：当前日期之前使用正式闰秒；未来日期在未发布新闰秒时采用
/// "最后已知表 + 预测 Delta T"策略并标识不确定性。本基线即"当前日期"快照。
const DATA_BASELINE_MJD_UTC: i64 = 61237; // 2026-07-16 00:00 UTC

/// 闰秒表。
#[derive(Debug, Clone)]
pub struct LeapSecondTable {
    entries: Vec<LeapSecondEntry>,
}

impl Default for LeapSecondTable {
    fn default() -> Self {
        Self::official()
    }
}

impl LeapSecondTable {
    /// 使用内置正式闰秒表。
    pub fn official() -> Self {
        Self {
            entries: OFFICIAL_LEAP_SECONDS.to_vec(),
        }
    }

    /// 自定义闰秒表（数据包升级时替换，设计文档 11.3）。
    pub fn from_entries(entries: Vec<LeapSecondEntry>) -> Self {
        let mut e = entries;
        e.sort_by_key(|x| x.mjd_utc);
        Self { entries: e }
    }

    /// 查询给定 UTC 约简儒略日（可为小数时刻）对应的 TAI - UTC。
    ///
    /// - 该日期 <= 数据基线日期：返回正式值，`is_predicted = false`（设计文档 11.3 当前日期前用正式闰秒）；
    /// - 该日期 > 数据基线日期：返回最后正式值，`is_predicted = true`（未来未发布新闰秒）。
    pub fn query(&self, mjd_utc: f64) -> LeapSecondQuery {
        let mjd_int = mjd_utc.floor() as i64;
        let mut current = 0i64;
        for entry in &self.entries {
            if mjd_int >= entry.mjd_utc {
                current = entry.tai_minus_utc;
            } else {
                break;
            }
        }
        let is_predicted = mjd_int > DATA_BASELINE_MJD_UTC && !self.entries.is_empty();
        LeapSecondQuery {
            tai_minus_utc: current,
            is_predicted,
        }
    }

    /// 最后已知正式闰秒生效的约简儒略日（UTC 午夜）。
    pub fn last_official_leap_mjd(&self) -> i64 {
        LAST_OFFICIAL_LEAP_MJD
    }

    /// 数据基线日期（UTC 约简儒略日）。
    pub fn data_baseline_mjd(&self) -> i64 {
        DATA_BASELINE_MJD_UTC
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_table_loads() {
        let t = LeapSecondTable::official();
        assert!(!t.entries.is_empty());
    }

    #[test]
    fn before_any_leap_second() {
        let t = LeapSecondTable::official();
        // 1971-01-01 MJD = 40587，早于首条闰秒
        let q = t.query(40587.0);
        assert_eq!(q.tai_minus_utc, 0);
        assert!(!q.is_predicted);
    }

    #[test]
    fn known_leap_second_2017() {
        let t = LeapSecondTable::official();
        // 2020-01-01 MJD = 58849，应已应用 37s
        let q = t.query(58849.0);
        assert_eq!(q.tai_minus_utc, 37);
        assert!(!q.is_predicted); // 2020 < 当前基线预测边界（最后正式闰秒 2017）
    }

    #[test]
    fn future_date_is_predicted() {
        let t = LeapSecondTable::official();
        // 2050-01-01 MJD ≈ 69796，未来日期
        let q = t.query(69796.0);
        assert_eq!(q.tai_minus_utc, 37);
        assert!(q.is_predicted);
    }
}
