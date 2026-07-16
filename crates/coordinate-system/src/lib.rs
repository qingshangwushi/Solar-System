//! 坐标、参考系与数值精度（设计文档第 12 节）。
//!
//! 内核统一采用双精度浮点。每个状态携带参考系标识，禁止把不同参考系向量直接相加。
//! 渲染层使用高低位拆分（f64 → 双 f32）上传 GPU。

#![forbid(unsafe_code)]
#![allow(missing_docs)]

pub mod frame;
pub mod math;
pub mod split;

pub use frame::{FrameMismatchError, ReferenceFrame};
pub use math::{Quat64, Vec3, Vec3d};
pub use split::{restore_f64_from_pair, split_f64_to_pair};
