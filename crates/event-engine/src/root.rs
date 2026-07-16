//! 数值求根与极值（设计文档 16.2）。
//!
//! 事件计算流程：粗步长扫描候选区间 → 目标函数符号变化或极值 → 数值求根/极值收敛。

/// 求根结果。
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RootResult {
    /// 找到根，自变量值。
    Found(f64),
    /// 该区间无符号变化。
    NoSignChange,
}

/// 在 [a, b] 上以步长 step 粗扫，对每个符号变化子区间用二分法精化求根。
///
/// `f` 为目标函数。容差 `tol` 为自变量精度。返回首个找到的根（设计文档 16.2）。
pub fn find_root<F>(a: f64, b: f64, step: f64, tol: f64, f: F) -> RootResult
where
    F: Fn(f64) -> f64,
{
    let mut x = a;
    let mut prev_val = f(x);
    while x < b {
        let next = (x + step).min(b);
        let val = f(next);
        if prev_val == 0.0 {
            return RootResult::Found(x);
        }
        if prev_val * val < 0.0 {
            // 二分精化
            let mut lo = x;
            let mut hi = next;
            let mut flo = prev_val;
            for _ in 0..200 {
                let mid = 0.5 * (lo + hi);
                if (hi - lo).abs() < tol {
                    return RootResult::Found(mid);
                }
                let fmid = f(mid);
                if fmid == 0.0 {
                    return RootResult::Found(mid);
                }
                if flo * fmid < 0.0 {
                    hi = mid;
                } else {
                    lo = mid;
                    flo = fmid;
                }
            }
            return RootResult::Found(0.5 * (lo + hi));
        }
        x = next;
        prev_val = val;
    }
    RootResult::NoSignChange
}

/// 极值结果。
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ExtremumResult {
    /// 找到极值，自变量值。
    Found(f64),
    /// 无极值。
    None,
}

/// 在 [a, b] 上以步长 step 扫描，寻找 `f` 的局部极小（返回最接近的极小点）。
///
/// 通过对导数符号变化求根实现（设计文档 16.2 极值收敛）。
pub fn find_extremum<F>(a: f64, b: f64, step: f64, tol: f64, f: F) -> ExtremumResult
where
    F: Fn(f64) -> f64,
{
    // 中心差分作为导数近似
    let df = |t: f64| {
        let h = step * 1e-3;
        (f(t + h) - f(t - h)) / (2.0 * h)
    };
    match find_root(a, b, step, tol, df) {
        RootResult::Found(t) => ExtremumResult::Found(t),
        RootResult::NoSignChange => ExtremumResult::None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_of_sin() {
        // sin(x) 在 [0.5, 4] 的根约为 pi（避开起点 0 的平凡根）
        match find_root(0.5, 4.0, 0.1, 1e-9, |t| t.sin()) {
            RootResult::Found(t) => assert!((t - std::f64::consts::PI).abs() < 1e-6, "t={t}"),
            other => panic!("expected root, got {other:?}"),
        }
    }

    #[test]
    fn no_sign_change_returns_none() {
        let r = find_root(0.0, 1.0, 0.1, 1e-9, |t| t * t + 1.0);
        assert_eq!(r, RootResult::NoSignChange);
    }

    #[test]
    fn extremum_of_parabola() {
        // (t-2)^2 在 [0,4] 极小在 t=2
        match find_extremum(0.0, 4.0, 0.1, 1e-6, |t| (t - 2.0).powi(2)) {
            ExtremumResult::Found(t) => assert!((t - 2.0).abs() < 1e-3, "t={t}"),
            other => panic!("expected extremum, got {other:?}"),
        }
    }
}
