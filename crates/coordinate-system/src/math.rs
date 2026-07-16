//! 双精度数学类型（设计文档 12.1 内核统一双精度）。

use serde::{Deserialize, Serialize};

/// 三维双精度向量。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Vec3d {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// 渲染层单精度向量别名（GPU 上传用）。
pub type Vec3 = [f32; 3];

impl Vec3d {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn from_array(a: [f64; 3]) -> Self {
        Self {
            x: a[0],
            y: a[1],
            z: a[2],
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn add(self, o: Self) -> Self {
        Self {
            x: self.x + o.x,
            y: self.y + o.y,
            z: self.z + o.z,
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn sub(self, o: Self) -> Self {
        Self {
            x: self.x - o.x,
            y: self.y - o.y,
            z: self.z - o.z,
        }
    }

    pub fn scale(self, s: f64) -> Self {
        Self {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }

    pub fn dot(self, o: Self) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }

    pub fn cross(self, o: Self) -> Self {
        Self {
            x: self.y * o.z - self.z * o.y,
            y: self.z * o.x - self.x * o.z,
            z: self.x * o.y - self.y * o.x,
        }
    }

    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalize(self) -> Self {
        let l = self.length();
        if l == 0.0 {
            Self::ZERO
        } else {
            self.scale(1.0 / l)
        }
    }

    /// 转为 f32 数组（GPU 上传）。
    pub fn to_f32(self) -> Vec3 {
        [self.x as f32, self.y as f32, self.z as f32]
    }
}

/// 双精度四元数（姿态，设计文档 15）。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Quat64 {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quat64 {
    pub const IDENTITY: Self = Self {
        w: 1.0,
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(w: f64, x: f64, y: f64, z: f64) -> Self {
        Self { w, x, y, z }
    }

    /// 从轴角构造（轴需归一化，单位弧度）。
    pub fn from_axis_angle(axis: Vec3d, angle_rad: f64) -> Self {
        let half = angle_rad * 0.5;
        let s = half.sin();
        let a = axis.normalize();
        Self {
            w: half.cos(),
            x: a.x * s,
            y: a.y * s,
            z: a.z * s,
        }
    }

    /// 四元数乘法（合成旋转）。
    #[allow(clippy::should_implement_trait)]
    pub fn mul(self, o: Self) -> Self {
        Self {
            w: self.w * o.w - self.x * o.x - self.y * o.y - self.z * o.z,
            x: self.w * o.x + self.x * o.w + self.y * o.z - self.z * o.y,
            y: self.w * o.y - self.x * o.z + self.y * o.w + self.z * o.x,
            z: self.w * o.z + self.x * o.y - self.y * o.x + self.z * o.w,
        }
    }

    /// 共轭。
    pub fn conjugate(self) -> Self {
        Self {
            w: self.w,
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }

    /// 旋转向量。
    pub fn rotate_vec(self, v: Vec3d) -> Vec3d {
        let qv = Vec3d::new(self.x, self.y, self.z);
        let t = qv.cross(v).scale(2.0);
        v.add(t.scale(self.w)).add(qv.cross(t))
    }

    pub fn to_f32(self) -> [f32; 4] {
        [self.w as f32, self.x as f32, self.y as f32, self.z as f32]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec_basic_ops() {
        let a = Vec3d::new(1.0, 2.0, 3.0);
        let b = Vec3d::new(4.0, 5.0, 6.0);
        assert_eq!(a.add(b), Vec3d::new(5.0, 7.0, 9.0));
        assert_eq!(a.dot(b), 32.0);
        assert_eq!(a.cross(b), Vec3d::new(-3.0, 6.0, -3.0));
    }

    #[test]
    fn quat_rotates_z_axis_by_90deg_to_x() {
        let q = Quat64::from_axis_angle(Vec3d::new(0.0, 1.0, 0.0), std::f64::consts::FRAC_PI_2);
        let v = q.rotate_vec(Vec3d::new(0.0, 0.0, 1.0));
        assert!((v.x - 1.0).abs() < 1e-12, "x = {}", v.x);
        assert!(v.z.abs() < 1e-12);
    }

    #[test]
    fn quat_identity_is_noop() {
        let v = Quat64::IDENTITY.rotate_vec(Vec3d::new(1.0, 2.0, 3.0));
        assert_eq!(v, Vec3d::new(1.0, 2.0, 3.0));
    }
}
