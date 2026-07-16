//! 星历与轨道模拟引擎运行时（设计文档第 14 节）。
//!
//! 采用"高精度星历为主，分级模型为辅"的混合方案。
//! 运行时根据 bodyId/TDB/参考系定位系数块并完成切比雪夫插值（设计文档 14.3）。

#![forbid(unsafe_code)]
#![allow(missing_docs)]

pub mod chebyshev;
pub mod provider;

pub use chebyshev::{chebyshev_eval, chebyshev_eval_derivative, ChebyshevSegment};
pub use provider::{EphemerisError, EphemerisProvider, EphemerisQuery, Precision, StateVector};
