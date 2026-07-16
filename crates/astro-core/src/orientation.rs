//! 自转与姿态（设计文档第 15 节）。

use coordinate_system::math::{Quat64, Vec3d};

/// 简化匀速自转：绕给定轴以恒定角速度旋转。
///
/// S 级天体应使用可追溯旋转模型（设计文档 15.2）；此函数用于数据不足对象的示意姿态，
/// 并在 UI 标注"自转状态不确定"（设计文档 15.3）。
pub fn simple_rotation(
    axis: Vec3d,
    angular_velocity_rad_per_s: f64,
    elapsed_seconds: f64,
) -> Quat64 {
    let angle = angular_velocity_rad_per_s * elapsed_seconds;
    Quat64::from_axis_angle(axis, angle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_rotation_is_identity() {
        let q = simple_rotation(Vec3d::new(0.0, 0.0, 1.0), 0.0, 100.0);
        assert_eq!(q, Quat64::IDENTITY);
    }
}
