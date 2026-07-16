//! 切比雪夫多项式插值（设计文档 14.3）。
//!
//! JPL 行星月球星历经构建管线转换为浏览器友好的分段切比雪夫系数（设计文档 14.2）。
//! 每段覆盖一个时间区间，记录该区间内位置三分量的切比雪夫系数。

use coordinate_system::math::Vec3d;
use serde::{Deserialize, Serialize};

/// 单个切比雪夫段：在时间区间 [t_start, t_end] 内对位置三分量各做 N 阶切比雪夫拟合。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChebyshevSegment {
    /// 区间起点（TDB，约简儒略日）。
    pub t_start: f64,
    /// 区间终点（TDB，约简儒略日）。
    pub t_end: f64,
    /// X 分量系数（长度 = 阶数+1）。
    pub coef_x: Vec<f64>,
    /// Y 分量系数。
    pub coef_y: Vec<f64>,
    /// Z 分量系数。
    pub coef_z: Vec<f64>,
}

impl ChebyshevSegment {
    /// 该段是否覆盖给定 TDB 时刻。
    pub fn contains(&self, tdb: f64) -> bool {
        tdb >= self.t_start && tdb <= self.t_end
    }

    /// 归一化时间到 [-1, 1]。
    fn normalize(&self, tdb: f64) -> f64 {
        let mid = 0.5 * (self.t_start + self.t_end);
        let half = 0.5 * (self.t_end - self.t_start);
        if half == 0.0 {
            0.0
        } else {
            (tdb - mid) / half
        }
    }
}

/// 计算切比雪夫基函数 T_0..T_n 在 x∈[-1,1] 处的值（Clenshaw）。
fn chebyshev_values(coef: &[f64], x: f64) -> f64 {
    let n = coef.len();
    if n == 0 {
        return 0.0;
    }
    if n == 1 {
        return coef[0];
    }
    let mut b_next = 0.0;
    let mut b_curr = coef[n - 1];
    let two_x = 2.0 * x;
    for k in (1..n - 1).rev() {
        let new_b = coef[k] + two_x * b_curr - b_next;
        b_next = b_curr;
        b_curr = new_b;
    }
    coef[0] + x * b_curr - b_next
}

/// 计算切比雪夫基函数的导数值 d/dx（Clenshaw 变体）。
fn chebyshev_derivatives(coef: &[f64], x: f64) -> f64 {
    let n = coef.len();
    if n <= 1 {
        return 0.0;
    }
    // T_k'(x) = k * U_{k-1}(x)，使用 U 的 Clenshaw。
    // 导数 = sum_{k=1}^{n-1} coef[k] * k * U_{k-1}(x)
    // 直接构造 U 系数：u_{k-1} = k * coef[k]
    let mut u = vec![0.0; n - 1];
    for k in 1..n {
        u[k - 1] = k as f64 * coef[k];
    }
    // Clenshaw on U
    let m = u.len();
    if m == 0 {
        return 0.0;
    }
    if m == 1 {
        return u[0];
    }
    let mut b_next = 0.0;
    let mut b_curr = u[m - 1];
    let two_x = 2.0 * x;
    for k in (1..m - 1).rev() {
        let new_b = u[k] + two_x * b_curr - b_next;
        b_next = b_curr;
        b_curr = new_b;
    }
    u[0] + two_x * b_curr - b_next
}

/// 在给定段内对 tdb 求值位置（km）。
pub fn chebyshev_eval(seg: &ChebyshevSegment, tdb: f64) -> Vec3d {
    let x = seg.normalize(tdb).clamp(-1.0, 1.0);
    Vec3d::new(
        chebyshev_values(&seg.coef_x, x),
        chebyshev_values(&seg.coef_y, x),
        chebyshev_values(&seg.coef_z, x),
    )
}

/// 在给定段内对 tdb 求值速度（km/day），需乘以 dTdb_d归一化 链导。
pub fn chebyshev_eval_derivative(seg: &ChebyshevSegment, tdb: f64) -> Vec3d {
    let x = seg.normalize(tdb).clamp(-1.0, 1.0);
    let half = 0.5 * (seg.t_end - seg.t_start);
    // dx/dt = 1 / half（归一化时间对真实时间的导数）
    let dxd_t = if half == 0.0 {
        0.0
    } else {
        2.0 / (seg.t_end - seg.t_start)
    };
    Vec3d::new(
        chebyshev_derivatives(&seg.coef_x, x) * dxd_t,
        chebyshev_derivatives(&seg.coef_y, x) * dxd_t,
        chebyshev_derivatives(&seg.coef_z, x) * dxd_t,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造一段对线性函数 f(t) = a*t + b 的切比雪夫拟合（精确，因线性函数在 T0/T1 上精确）。
    fn linear_segment(t0: f64, t1: f64, a: f64, b: f64) -> ChebyshevSegment {
        // f(x) = a * (mid + half*x) + b = (a*mid+b) + (a*half) * x
        // T0=1, T1=x => coef = [a*mid+b, a*half]
        let mid = 0.5 * (t0 + t1);
        let half = 0.5 * (t1 - t0);
        let c0 = a * mid + b;
        let c1 = a * half;
        ChebyshevSegment {
            t_start: t0,
            t_end: t1,
            coef_x: vec![c0, c1],
            coef_y: vec![0.0, 0.0],
            coef_z: vec![0.0, 0.0],
        }
    }

    #[test]
    fn linear_eval_exact() {
        let seg = linear_segment(0.0, 100.0, 3.0, 7.0); // f(t)=3t+7
        for t in [0.0, 25.0, 50.0, 75.0, 100.0] {
            let p = chebyshev_eval(&seg, t);
            assert!((p.x - (3.0 * t + 7.0)).abs() < 1e-9, "t={t}, x={}", p.x);
        }
    }

    #[test]
    fn linear_deriv_exact() {
        let seg = linear_segment(0.0, 100.0, 3.0, 7.0); // df/dt = 3
        let v = chebyshev_eval_derivative(&seg, 50.0);
        assert!((v.x - 3.0).abs() < 1e-9, "deriv x = {}", v.x);
    }

    #[test]
    fn out_of_segment_clamped() {
        let seg = linear_segment(0.0, 100.0, 3.0, 7.0);
        // 超出区间会被 clamp 到端点值
        let p = chebyshev_eval(&seg, 200.0);
        assert!((p.x - (3.0 * 100.0 + 7.0)).abs() < 1e-9);
    }
}
