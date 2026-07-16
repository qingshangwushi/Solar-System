//! 事件类型与结果结构（设计文档 16.1、16.5）。

use coordinate_system::frame::ReferenceFrame;
use serde::{Deserialize, Serialize};

/// 事件类型（设计文档 16.1）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EventType {
    /// 合。
    Conjunction,
    /// 冲。
    Opposition,
    /// 最大距角。
    GreatestElongation,
    /// 四分相。
    Quadrature,
    /// 近日点。
    Perihelion,
    /// 远日点。
    Aphelion,
    /// 日食。
    SolarEclipse,
    /// 月食。
    LunarEclipse,
    /// 行星凌日。
    Transit,
    /// 掩星。
    Occultation,
    /// 卫星凌越。
    SatelliteTransit,
    /// 卫星食。
    SatelliteEclipse,
}

/// 事件精度档（16.4）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventPrecision {
    /// 快速档：几何位置。
    Geometric,
    /// 标准档：单次光行时修正。
    LightTimeCorrected,
    /// 高精度档：迭代光行时、相对速度和参考系修正。
    HighPrecision,
    /// 预测/近似（FR-EVENT-007）。
    Predicted,
}

/// 事件阶段时刻（16.5）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct EventPhase {
    /// 开始（TDB MJD）。
    pub begin: f64,
    /// 极大（TDB MJD）。
    pub maximum: f64,
    /// 结束（TDB MJD）。
    pub end: f64,
}

/// 事件唯一标识。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EventId(pub String);

/// 事件记录（设计文档 16.5）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub id: EventId,
    pub event_type: EventType,
    /// 参与天体 bodyId 列表。
    pub participants: Vec<u64>,
    pub phase: EventPhase,
    pub frame: ReferenceFrame,
    pub precision: EventPrecision,
    /// 主要几何参数（键值，如 magnitude, obscuration, separation_arcsec）。
    pub geometry: std::collections::BTreeMap<String, f64>,
    /// 误差估计（秒）。
    pub uncertainty_seconds: f64,
    /// 推荐镜头（目标 bodyId）。
    pub recommended_camera_target: Option<u64>,
    /// 推荐时间倍率。
    pub recommended_time_rate: f64,
}
