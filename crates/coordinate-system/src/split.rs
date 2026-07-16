//! 高低位拆分（设计文档 12.2）。
//!
//! GPU 使用 32 位浮点，不能直接接收以千米计的太阳系绝对坐标。
//! 将 f64 拆为高位 f32 与低位 f32，渲染时在着色器内恢复，提升精度。

/// 将 f64 拆分为（高位 f32, 低位 f32），使得 hi + lo ≈ value，且误差在 f32 ULP 量级。
pub fn split_f64_to_pair(value: f64) -> (f32, f32) {
    let hi_f32 = value as f32;
    let hi_approx = hi_f32 as f64;
    let lo_f32 = (value - hi_approx) as f32;
    (hi_f32, lo_f32)
}

/// 从高低位 f32 恢复 f64。
pub fn restore_f64_from_pair(hi: f32, lo: f32) -> f64 {
    hi as f64 + lo as f64
}

/// 将三维双精度向量拆分为高低位数组，供 GPU attribute 上传。
pub fn split_vec3(v: crate::math::Vec3d) -> ([f32; 3], [f32; 3]) {
    let (hx, lx) = split_f64_to_pair(v.x);
    let (hy, ly) = split_f64_to_pair(v.y);
    let (hz, lz) = split_f64_to_pair(v.z);
    ([hx, hy, hz], [lx, ly, lz])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_restore_roundtrip_small() {
        let v = 1.234_567_890_123_f64;
        let (hi, lo) = split_f64_to_pair(v);
        let back = restore_f64_from_pair(hi, lo);
        assert!((back - v).abs() < 1e-6, "back = {back}, v = {v}");
    }

    #[test]
    fn split_restore_roundtrip_large() {
        // 太阳系尺度：1.5e8 km（日地距离）
        let v = 1.495978707e8_f64;
        let (hi, lo) = split_f64_to_pair(v);
        let back = restore_f64_from_pair(hi, lo);
        // 高低位拆分后相对误差应远小于渲染可见阈值（< 1e-3 相对）
        let rel_err = ((back - v).abs()) / v.abs();
        assert!(rel_err < 1e-6, "rel_err = {rel_err}");
    }

    #[test]
    fn split_vec3_roundtrip() {
        let v = crate::math::Vec3d::new(1.0e8, 2.0e7, -3.0e6);
        let (hi, lo) = split_vec3(v);
        let back = crate::math::Vec3d::new(
            restore_f64_from_pair(hi[0], lo[0]),
            restore_f64_from_pair(hi[1], lo[1]),
            restore_f64_from_pair(hi[2], lo[2]),
        );
        let rel = (back.sub(v)).length() / v.length();
        assert!(rel < 1e-6, "rel = {rel}");
    }
}
