//! 时间尺度枚举（设计文档 11.1）。

use serde::{Deserialize, Serialize};

/// 天文时间尺度。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TimeScale {
    /// 国际原子时（连续，无跳秒）。
    Tai,
    /// 地球力学时 / 地球时（连续）。TT = TAI + 32.184s。
    Tt,
    /// 太阳系质心力学时（星历计算用，连续）。
    Tdb,
    /// 协调世界时（含跳秒，非连续）。
    Utc,
}

impl TimeScale {
    /// 该时间尺度是否为连续尺度（无跳秒）。
    pub fn is_continuous(self) -> bool {
        matches!(self, TimeScale::Tai | TimeScale::Tt | TimeScale::Tdb)
    }
}

impl std::fmt::Display for TimeScale {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TimeScale::Tai => write!(f, "TAI"),
            TimeScale::Tt => write!(f, "TT"),
            TimeScale::Tdb => write!(f, "TDB"),
            TimeScale::Utc => write!(f, "UTC"),
        }
    }
}
