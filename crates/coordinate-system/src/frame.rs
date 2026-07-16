//! 参考系标识（设计文档 12.1）。

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// 核心参考系。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReferenceFrame {
    /// 太阳系质心惯性系（SSBI）。
    SolarSystemBarycentricInertial,
    /// 日心惯性系。
    HeliocentricInertial,
    /// 行星质心系。
    BodyBarycentric,
    /// 天体固连系。
    BodyFixed,
    /// 地表局部东-北-天坐标系（ENU）。
    SurfaceLocalEnu,
    /// 观察者相对系。
    ObserverRelative,
}

impl ReferenceFrame {
    /// 简短代号。
    pub fn code(self) -> &'static str {
        match self {
            ReferenceFrame::SolarSystemBarycentricInertial => "SSBI",
            ReferenceFrame::HeliocentricInertial => "HCI",
            ReferenceFrame::BodyBarycentric => "BC",
            ReferenceFrame::BodyFixed => "BF",
            ReferenceFrame::SurfaceLocalEnu => "ENU",
            ReferenceFrame::ObserverRelative => "OBS",
        }
    }
}

impl std::fmt::Display for ReferenceFrame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code())
    }
}

/// 参考系不匹配错误（禁止跨系直接相加，设计文档 12.1）。
#[derive(Debug, Clone, PartialEq, Error)]
#[error("参考系不匹配：{lhs} 与 {rhs}，禁止直接相加")]
pub struct FrameMismatchError {
    pub lhs: ReferenceFrame,
    pub rhs: ReferenceFrame,
}

/// 带参考系标识的向量。跨系运算前必须校验参考系一致。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FramedVec3 {
    pub frame: ReferenceFrame,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl FramedVec3 {
    /// 构造。
    pub fn new(frame: ReferenceFrame, x: f64, y: f64, z: f64) -> Self {
        Self { frame, x, y, z }
    }

    /// 校验两向量同系，返回可相加保证。
    pub fn ensure_same_frame(&self, other: &FramedVec3) -> Result<(), FrameMismatchError> {
        if self.frame != other.frame {
            Err(FrameMismatchError {
                lhs: self.frame,
                rhs: other.frame,
            })
        } else {
            Ok(())
        }
    }

    /// 同系相加；不同系返回错误（设计文档 12.1 守护）。
    pub fn add(&self, other: &FramedVec3) -> Result<FramedVec3, FrameMismatchError> {
        self.ensure_same_frame(other)?;
        Ok(FramedVec3 {
            frame: self.frame,
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        })
    }

    /// 同系相减。
    pub fn sub(&self, other: &FramedVec3) -> Result<FramedVec3, FrameMismatchError> {
        self.ensure_same_frame(other)?;
        Ok(FramedVec3 {
            frame: self.frame,
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_frame_add_ok() {
        let a = FramedVec3::new(ReferenceFrame::HeliocentricInertial, 1.0, 2.0, 3.0);
        let b = FramedVec3::new(ReferenceFrame::HeliocentricInertial, 4.0, 5.0, 6.0);
        let c = a.add(&b).unwrap();
        assert_eq!(c.x, 5.0);
    }

    #[test]
    fn cross_frame_add_rejected() {
        let a = FramedVec3::new(ReferenceFrame::HeliocentricInertial, 1.0, 2.0, 3.0);
        let b = FramedVec3::new(ReferenceFrame::BodyFixed, 4.0, 5.0, 6.0);
        let err = a.add(&b).unwrap_err();
        assert_eq!(err.lhs, ReferenceFrame::HeliocentricInertial);
        assert_eq!(err.rhs, ReferenceFrame::BodyFixed);
    }
}
