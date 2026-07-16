//! 天文时间系统（设计文档第 11 节）
//!
//! 提供 JD/UTC/TAI/TT/TDB 表示与转换、闰秒表、时间倍率与边界。
//! 内部轨道计算基于连续时间尺度，避免 UTC 跳秒导致轨道不连续。

#![forbid(unsafe_code)]
#![allow(missing_docs)]

pub mod leap_seconds;
pub mod scale;
pub mod time;

pub use scale::TimeScale;
pub use time::{JulianDate, TimeError, TimeRange};
