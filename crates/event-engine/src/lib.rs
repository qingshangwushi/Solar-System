//! 天文事件计算引擎（设计文档第 16 节）。
//!
//! 事件类型：角位置事件（合/冲/最大距角/四分相/近日远日点）与
//! 盘面重叠事件（日月食/凌日/掩星/卫星凌越/卫星食）。
//!
//! 计算流程（16.2）：粗扫 → 目标函数符号变化/极值 → 数值求根/极值收敛 → 接触时刻与几何 → 事件记录。

#![forbid(unsafe_code)]
#![allow(missing_docs)]

pub mod root;
pub mod satellite_events;
pub mod types;

pub use root::{find_extremum, find_root};
pub use satellite_events::{
    find_satellite_eclipses, find_satellite_transits, solution_to_record, PositionEvaluator,
    SatelliteEventInput, SatelliteEventSolution,
};
pub use types::{EventId, EventPhase, EventPrecision, EventRecord, EventType};
