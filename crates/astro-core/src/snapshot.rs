//! 天体状态快照（设计文档 10.2、42.3）。
//!
//! 不可变的 `CelestialStateSnapshot`，由天文内核产出，供渲染桥消费。

use coordinate_system::frame::ReferenceFrame;
use coordinate_system::math::{Quat64, Vec3d};
use ephemeris_runtime::provider::{Precision, StateVector};
use serde::{Deserialize, Serialize};
use time_system::time::JulianDate;

/// 光照信息。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Illumination {
    /// 太阳方向（天体处，归一化）。
    pub sun_direction: Vec3d,
    /// 被照亮比例 [0,1]。
    pub illuminated_fraction: f64,
}

/// 状态标志（设计文档 42.3 flags）。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct StateFlags {
    /// 是否为 NaN/异常位置（安全失败标记）。
    pub is_nan_position: bool,
    /// 是否为降级近似。
    pub is_degraded: bool,
    /// 是否为预测时间转换（未来闰秒）。
    pub is_predicted_time: bool,
}

/// 单个天体的状态（设计文档 42.3 bodies[]）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BodyState {
    pub body_id: u64,
    /// 双精度位置（km）。
    pub position: Vec3d,
    /// 双精度速度（km/day）。
    pub velocity: Vec3d,
    pub frame: ReferenceFrame,
    /// 姿态四元数（天体固连→惯性）。
    pub orientation: Quat64,
    /// 角速度（rad/s，天体固连系）。
    pub angular_velocity: Vec3d,
    pub illumination: Illumination,
    pub precision: Precision,
    pub flags: StateFlags,
}

impl BodyState {
    /// 从星历状态向量构造（姿态恒等，光照待补）。
    pub fn from_state_vector(body_id: u64, s: StateVector, tdb: JulianDate) -> Self {
        let flags = StateFlags {
            is_nan_position: s.position.x.is_nan()
                || s.position.y.is_nan()
                || s.position.z.is_nan(),
            is_degraded: matches!(s.precision, Precision::P0 | Precision::P1),
            is_predicted_time: tdb.uncertainty.predicted,
        };
        Self {
            body_id,
            position: s.position,
            velocity: s.velocity,
            frame: s.frame,
            orientation: Quat64::IDENTITY,
            angular_velocity: Vec3d::ZERO,
            illumination: Illumination::default(),
            precision: s.precision,
            flags,
        }
    }
}

/// 天体状态快照（设计文档 42.3）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CelestialStateSnapshot {
    pub simulation_time_utc: JulianDate,
    pub simulation_time_tdb: JulianDate,
    pub reference_epoch: f64,
    pub bodies: Vec<BodyState>,
}

impl CelestialStateSnapshot {
    /// 查找某天体状态。
    pub fn find(&self, body_id: u64) -> Option<&BodyState> {
        self.bodies.iter().find(|b| b.body_id == body_id)
    }
}
