//! 星历提供器接口与降级策略（设计文档 14.1、14.3、FR-ASTRO）。

use crate::chebyshev::ChebyshevSegment;
use coordinate_system::frame::ReferenceFrame;
use coordinate_system::math::Vec3d;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// 数据精度等级（设计文档 13.4）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Precision {
    /// P0：未知或仅有名称，不能计算可靠轨道。
    P0,
    /// P1：平均轨道根数或低精度拟合，仅适合科普显示。
    P1,
    /// P2：有限时间段数值星历或较完整摄动模型。
    P2,
    /// P3：高精度 SPK/等效星历，适合项目科学模式。
    P3,
    /// P4：核心天体高精度星历和姿态数据，经过自动基准对照。
    P4,
}

impl Precision {
    /// 用户可读标签（设计文档 13.4，UI 不必显示 P0—P4 代码）。
    pub fn label(self) -> &'static str {
        match self {
            Precision::P0 => "数据不足",
            Precision::P1 => "近似轨道",
            Precision::P2 => "计算模型",
            Precision::P3 => "高精度星历",
            Precision::P4 => "高精度星历",
        }
    }
}

/// 天体状态向量（位置 km，速度 km/day）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StateVector {
    pub position: Vec3d,
    pub velocity: Vec3d,
    pub frame: ReferenceFrame,
    pub precision: Precision,
}

/// 星历查询结果。
#[derive(Debug, Clone, PartialEq)]
pub enum EphemerisQuery {
    /// 正常返回状态。
    Ok(StateVector),
    /// 超出星历覆盖范围，返回降级状态（FR-ASTRO-004，不输出伪高精度）。
    OutOfRange {
        body_id: u64,
        tdb: f64,
        fallback: Option<StateVector>,
    },
}

/// 星历错误。
#[derive(Debug, Clone, PartialEq, Error)]
pub enum EphemerisError {
    #[error("天体 {0} 无可用星历提供器")]
    NoProvider(u64),
    #[error("星历数据损坏: {0}")]
    Corrupt(String),
}

/// 单个天体的星历提供器：一组按时间排序的切比雪夫段。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyEphemeris {
    pub body_id: u64,
    pub frame: ReferenceFrame,
    pub precision: Precision,
    pub segments: Vec<ChebyshevSegment>,
}

impl BodyEphemeris {
    /// 该提供器覆盖的时间范围 [t_start_min, t_end_max]。
    pub fn coverage(&self) -> Option<(f64, f64)> {
        let start = self.segments.first().map(|s| s.t_start)?;
        let end = self.segments.last().map(|s| s.t_end)?;
        Some((start, end))
    }

    /// 定位包含 tdb 的段（线性扫描；运行时可换为索引）。
    pub fn find_segment(&self, tdb: f64) -> Option<&ChebyshevSegment> {
        self.segments.iter().find(|s| s.contains(tdb))
    }

    /// 求值状态。超范围返回 OutOfRange（设计文档 14.3 伪流程）。
    pub fn evaluate(&self, tdb: f64) -> EphemerisQuery {
        match self.find_segment(tdb) {
            Some(seg) => {
                use crate::chebyshev::{chebyshev_eval, chebyshev_eval_derivative};
                let pos = chebyshev_eval(seg, tdb);
                let vel = chebyshev_eval_derivative(seg, tdb);
                EphemerisQuery::Ok(StateVector {
                    position: pos,
                    velocity: vel,
                    frame: self.frame,
                    precision: self.precision,
                })
            }
            None => EphemerisQuery::OutOfRange {
                body_id: self.body_id,
                tdb,
                fallback: None,
            },
        }
    }
}

/// 星历注册表：按 bodyId 索引。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EphemerisProvider {
    pub bodies: std::collections::BTreeMap<u64, BodyEphemeris>,
}

impl EphemerisProvider {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册一个天体的星历。
    pub fn register(&mut self, eph: BodyEphemeris) {
        self.bodies.insert(eph.body_id, eph);
    }

    /// 是否支持某天体。
    pub fn supports(&self, body_id: u64) -> bool {
        self.bodies.contains_key(&body_id)
    }

    /// 求值天体状态（设计文档 42.2 EphemerisProvider）。
    pub fn get_state(&self, body_id: u64, tdb: f64) -> EphemerisQuery {
        match self.bodies.get(&body_id) {
            Some(eph) => eph.evaluate(tdb),
            None => EphemerisQuery::OutOfRange {
                body_id,
                tdb,
                fallback: None,
            },
        }
    }

    /// 查询某天体星历覆盖范围。
    pub fn get_coverage(&self, body_id: u64) -> Option<(f64, f64)> {
        self.bodies.get(&body_id)?.coverage()
    }

    /// 查询某天体精度等级。
    pub fn get_precision(&self, body_id: u64) -> Option<Precision> {
        self.bodies.get(&body_id).map(|e| e.precision)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chebyshev::ChebyshevSegment;

    fn make_linear_eph(body_id: u64, t0: f64, t1: f64) -> BodyEphemeris {
        // f(t) = 2t + 1 on [t0, t1]
        let mid = 0.5 * (t0 + t1);
        let half = 0.5 * (t1 - t0);
        BodyEphemeris {
            body_id,
            frame: ReferenceFrame::HeliocentricInertial,
            precision: Precision::P4,
            segments: vec![ChebyshevSegment {
                t_start: t0,
                t_end: t1,
                coef_x: vec![2.0 * mid + 1.0, 2.0 * half],
                coef_y: vec![0.0, 0.0],
                coef_z: vec![0.0, 0.0],
            }],
        }
    }

    #[test]
    fn provider_eval_in_range() {
        let mut p = EphemerisProvider::new();
        p.register(make_linear_eph(399, 51544.0, 51544.0 + 32.0));
        match p.get_state(399, 51544.0 + 16.0) {
            EphemerisQuery::Ok(s) => {
                assert!((s.position.x - (2.0 * (51544.0 + 16.0) + 1.0)).abs() < 1e-6);
                assert_eq!(s.precision, Precision::P4);
            }
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[test]
    fn provider_eval_out_of_range_returns_fallback_flag() {
        let mut p = EphemerisProvider::new();
        p.register(make_linear_eph(399, 51544.0, 51544.0 + 32.0));
        match p.get_state(399, 99999.0) {
            EphemerisQuery::OutOfRange {
                body_id, fallback, ..
            } => {
                assert_eq!(body_id, 399);
                assert!(fallback.is_none(), "超范围不得输出伪高精度位置");
            }
            other => panic!("expected OutOfRange, got {other:?}"),
        }
    }

    #[test]
    fn unknown_body_out_of_range() {
        let p = EphemerisProvider::new();
        assert!(matches!(
            p.get_state(123, 51544.0),
            EphemerisQuery::OutOfRange { .. }
        ));
    }
}
