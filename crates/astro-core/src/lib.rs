//! 天文模拟内核（设计文档第 9—16 节）。
//!
//! 组合 time-system + coordinate-system + ephemeris-runtime + event-engine，
//! 输出不可变的 `CelestialStateSnapshot`（设计文档 10.2、42.3）。
//!
//! 架构原则（设计文档 9.3）：
//! - 天文内核不引用 Three.js 类型；
//! - 渲染引擎不自行推算天体轨道；
//! - 高精度优先，缺失降级。

#![forbid(unsafe_code)]
#![allow(missing_docs)]

pub mod catalog;
pub mod orientation;
pub mod snapshot;
pub mod wasm;

use coordinate_system::math::Vec3d;
use ephemeris_runtime::provider::{EphemerisProvider, EphemerisQuery};
use time_system::time::{JulianDate, TimeConverter, TimeError, TimeRange};

pub use snapshot::{BodyState, CelestialStateSnapshot, Illumination, StateFlags};

/// 天文内核。
#[derive(Debug, Clone)]
pub struct AstroCore {
    converter: TimeConverter,
    ephemeris: EphemerisProvider,
    catalog: catalog::Catalog,
    time_range: TimeRange,
}

/// 内核错误。
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum AstroError {
    #[error("时间错误: {0}")]
    Time(#[from] TimeError),
    #[error("天体 {0} 无可用星历")]
    NoEphemeris(u64),
    #[error("天体 {0} 不在目录中")]
    NotInCatalog(u64),
}

impl AstroCore {
    /// 构造内核。
    pub fn new(
        converter: TimeConverter,
        ephemeris: EphemerisProvider,
        catalog: catalog::Catalog,
    ) -> Self {
        let mut core = Self {
            converter,
            ephemeris,
            catalog,
            time_range: TimeRange::default(),
        };
        core.refresh_time_range();
        core
    }

    /// 刷新时间范围：遍历 ephemeris.bodies 所有 segments，取 min(t_start)/max(t_end)。
    ///
    /// 无已注册天体时回退到默认项目范围（1900-2100，设计文档第 2 章）。
    pub fn refresh_time_range(&mut self) {
        let mut min_t = f64::INFINITY;
        let mut max_t = f64::NEG_INFINITY;
        for eph in self.ephemeris.bodies.values() {
            for seg in &eph.segments {
                if seg.t_start < min_t {
                    min_t = seg.t_start;
                }
                if seg.t_end > max_t {
                    max_t = seg.t_end;
                }
            }
        }
        if min_t.is_finite() && max_t.is_finite() {
            self.time_range = TimeRange {
                start_mjd_utc: min_t,
                end_mjd_utc: max_t,
            };
        } else {
            self.time_range = TimeRange::default();
        }
    }

    /// 注册一段星历并刷新时间范围（设计文档 14.1、E-40）。
    pub fn register_ephemeris(&mut self, body: BodyEphemeris) {
        self.ephemeris.register(body);
        self.refresh_time_range();
    }

    /// 求值单个天体在 UTC 时刻的状态（设计文档 42.2 evaluateState）。
    pub fn evaluate_state(&self, body_id: u64, utc: JulianDate) -> Result<BodyState, AstroError> {
        utc.check_range()?;
        let tdb = self.converter.to_tdb(utc);
        match self.ephemeris.get_state(body_id, tdb.mjd) {
            EphemerisQuery::Ok(s) => Ok(BodyState::from_state_vector(body_id, s, tdb)),
            EphemerisQuery::OutOfRange { fallback, .. } => {
                // 超范围走 fallback，不输出伪高精度（设计文档 14.3、FR-ASTRO-004）
                if let Some(fallback) = fallback {
                    Ok(BodyState::from_state_vector(body_id, fallback, tdb))
                } else {
                    Err(AstroError::NoEphemeris(body_id))
                }
            }
        }
    }

    /// 求值多个天体，生成状态快照（设计文档 42.3 CelestialStateSnapshot）。
    pub fn evaluate_snapshot(
        &self,
        body_ids: &[u64],
        utc: JulianDate,
    ) -> Result<CelestialStateSnapshot, AstroError> {
        utc.check_range()?;
        let tdb = self.converter.to_tdb(utc);
        let mut bodies = Vec::with_capacity(body_ids.len());
        for id in body_ids {
            match self.ephemeris.get_state(*id, tdb.mjd) {
                EphemerisQuery::Ok(s) => bodies.push(BodyState::from_state_vector(*id, s, tdb)),
                EphemerisQuery::OutOfRange { .. } => {
                    return Err(AstroError::NoEphemeris(*id));
                }
            }
        }
        Ok(CelestialStateSnapshot {
            simulation_time_utc: utc,
            simulation_time_tdb: tdb,
            reference_epoch: 0.0,
            bodies,
        })
    }

    /// 轨道线自适应步长采样（设计文档 14.4、E-27）。
    ///
    /// 在 [t_start, t_end]（UTC MJD）范围内对 bodyId 采样状态位置，返回 (tdb_mjd, position) 列表。
    /// 基于速度梯度自适应步长：梯度大（近日点附近）→ 缩小步长；梯度小（远日点附近）→ 回退 base_step_days。
    /// 步长限制在 [0.1x, 2x] base_step_days，避免过密或过疏。
    pub fn sample_orbit(
        &self,
        body_id: u64,
        t_start_utc: f64,
        t_end_utc: f64,
        base_step_days: f64,
    ) -> Result<Vec<(f64, Vec3d)>, AstroError> {
        let mut out = Vec::new();
        let mut t = t_start_utc;
        // 维护最近一次采样的速度与时间，用于计算速度梯度
        let mut prev_speed: Option<f64> = None;
        let mut prev_t: Option<f64> = None;
        let min_step = 0.1 * base_step_days;
        let max_step = 2.0 * base_step_days;
        while t <= t_end_utc {
            let utc = JulianDate::new(t, time_system::scale::TimeScale::Utc);
            let tdb = self.converter.to_tdb(utc);
            match self.ephemeris.get_state(body_id, tdb.mjd) {
                EphemerisQuery::Ok(s) => {
                    let speed = s.velocity.length();
                    out.push((tdb.mjd, s.position));
                    // 计算下一自适应步长
                    let mut step = base_step_days;
                    if let (Some(ps), Some(pt)) = (prev_speed, prev_t) {
                        let dt = t - pt;
                        if dt > 0.0 {
                            let speed_gradient = (speed - ps).abs() / dt;
                            // 梯度大 → 缩小步长；梯度小 → 接近 base_step_days
                            step = base_step_days / (1.0 + speed_gradient * 100.0);
                            // 限制在 [0.1x, 2x] base_step_days
                            if step < min_step {
                                step = min_step;
                            } else if step > max_step {
                                step = max_step;
                            }
                        }
                    }
                    prev_speed = Some(speed);
                    prev_t = Some(t);
                    t += step;
                }
                EphemerisQuery::OutOfRange { .. } => {
                    // 超范围停止采样，不伪造（FR-ASTRO-004）
                    break;
                }
            }
        }
        Ok(out)
    }

    /// 时间转换器引用。
    pub fn converter(&self) -> &TimeConverter {
        &self.converter
    }

    /// 星历提供器引用。
    pub fn ephemeris(&self) -> &EphemerisProvider {
        &self.ephemeris
    }

    /// 星历提供器可变引用（用于运行时注册星历段）。
    pub fn ephemeris_mut(&mut self) -> &mut EphemerisProvider {
        &mut self.ephemeris
    }

    /// 目录引用。
    pub fn catalog(&self) -> &catalog::Catalog {
        &self.catalog
    }

    /// 时间范围。
    pub fn time_range(&self) -> TimeRange {
        self.time_range
    }
}

/// 重新导出常用类型。
pub use catalog::{AssetTier, BodyRecord, Catalog, CatalogMeta};
pub use orientation::simple_rotation;

// 保留对底层模块的便捷引用。
pub use ephemeris_runtime::chebyshev::ChebyshevSegment as ChebySeg;
pub use ephemeris_runtime::provider::BodyEphemeris;

#[cfg(test)]
mod tests {
    use super::*;
    use coordinate_system::frame::ReferenceFrame;
    use ephemeris_runtime::chebyshev::ChebyshevSegment;
    use ephemeris_runtime::provider::{BodyEphemeris, EphemerisProvider, Precision};
    use time_system::leap_seconds::LeapSecondTable;
    use time_system::scale::TimeScale;
    use time_system::time::{JulianDate, TimeConverter};

    fn linear_eph(body_id: u64, t0: f64, t1: f64) -> BodyEphemeris {
        let mid = 0.5 * (t0 + t1);
        let half = 0.5 * (t1 - t0);
        BodyEphemeris {
            body_id,
            frame: ReferenceFrame::HeliocentricInertial,
            precision: Precision::P4,
            segments: vec![ChebyshevSegment {
                t_start: t0,
                t_end: t1,
                coef_x: vec![2.0 * mid + 1.0, 2.0 * half],
                coef_y: vec![0.0, 0.0],
                coef_z: vec![0.0, 0.0],
            }],
        }
    }

    /// 二次型星历：f(t) = a*(t-mid)^2，速度线性变化，用于测试自适应步长。
    /// chebyshev: x^2 = (T2+1)/2，故 f = a*half^2/2 * (T0 + T2)。
    fn quadratic_eph(body_id: u64, t0: f64, t1: f64, a: f64) -> BodyEphemeris {
        let half = 0.5 * (t1 - t0);
        let c = a * half * half / 2.0;
        BodyEphemeris {
            body_id,
            frame: ReferenceFrame::HeliocentricInertial,
            precision: Precision::P4,
            segments: vec![ChebyshevSegment {
                t_start: t0,
                t_end: t1,
                coef_x: vec![c, 0.0, c],
                coef_y: vec![0.0, 0.0, 0.0],
                coef_z: vec![0.0, 0.0, 0.0],
            }],
        }
    }

    #[test]
    fn evaluate_state_linear() {
        let conv = TimeConverter::with_leap_seconds(LeapSecondTable::official());
        let mut eph = EphemerisProvider::new();
        eph.register(linear_eph(399, 51544.0, 51544.0 + 32.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let utc = JulianDate::new(51544.0 + 16.0, TimeScale::Utc);
        let st = core.evaluate_state(399, utc).unwrap();
        // f(tdb) = 2*tdb + 1，tdb ≈ utc + 64.184s/86400
        let tdb = core.converter().to_tdb(utc).mjd;
        assert!((st.position.x - (2.0 * tdb + 1.0)).abs() < 1e-6);
        assert!(!st.flags.is_nan_position);
    }

    #[test]
    fn out_of_range_errors_no_fake_precision() {
        let conv = TimeConverter::default();
        let mut eph = EphemerisProvider::new();
        eph.register(linear_eph(399, 51544.0, 51544.0 + 32.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let utc = JulianDate::new(60000.0, TimeScale::Utc); // 范围内但星历超覆盖
        let res = core.evaluate_state(399, utc);
        assert!(matches!(res, Err(AstroError::NoEphemeris(399))));
    }

    #[test]
    fn sample_orbit_linear_constant_step() {
        // 线性星历速度恒定，速度梯度=0，步长=base_step_days（与固定步长一致）
        let conv = TimeConverter::default();
        let mut eph = EphemerisProvider::new();
        eph.register(linear_eph(399, 51544.0, 51544.0 + 32.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let samples = core.sample_orbit(399, 51544.0, 51544.0 + 10.0, 2.0).unwrap();
        // 固定步长 2.0，[0,10] → 6 个点（0,2,4,6,8,10）
        assert_eq!(samples.len(), 6, "linear ephemeris should keep base step");
    }

    #[test]
    fn sample_orbit_quadratic_shrinks_step() {
        // 二次型星历速度梯度大，步长缩小，采样点比固定步长更密
        let conv = TimeConverter::default();
        let mut eph = EphemerisProvider::new();
        eph.register(quadratic_eph(399, 51544.0, 51544.0 + 32.0, 1.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let samples = core.sample_orbit(399, 51544.0, 51544.0 + 10.0, 2.0).unwrap();
        // 梯度=2，step=2/(1+200)≈0.01，被钳制到 min_step=0.2
        // [0,10]/0.2 ≈ 50 个点，远多于固定步长的 6 个
        assert!(
            samples.len() > 20,
            "expected dense sampling for high gradient, got {}",
            samples.len()
        );
    }

    #[test]
    fn sample_orbit_step_clamped_to_min() {
        // 极大梯度时步长不低于 0.1*base_step_days
        let conv = TimeConverter::default();
        let mut eph = EphemerisProvider::new();
        eph.register(quadratic_eph(399, 51544.0, 51544.0 + 32.0, 100.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let samples = core.sample_orbit(399, 51544.0, 51544.0 + 10.0, 2.0).unwrap();
        // 最小步长 0.2，[0,10] 最多约 51 个点，不会无限密集
        assert!(
            samples.len() <= 60,
            "expected min-step clamping, got {}",
            samples.len()
        );
        assert!(
            samples.len() >= 35,
            "expected clamping to 0.2 step, got {}",
            samples.len()
        );
    }

    #[test]
    fn sample_orbit_empty_when_no_ephemeris() {
        let conv = TimeConverter::default();
        let eph = EphemerisProvider::new();
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        // 未注册星历：超范围立即停止，返回空
        let samples = core.sample_orbit(999, 51544.0, 51544.0 + 10.0, 2.0).unwrap();
        assert!(samples.is_empty());
    }

    #[test]
    fn refresh_time_range_default_when_empty() {
        let conv = TimeConverter::default();
        let eph = EphemerisProvider::new();
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let r = core.time_range();
        // 无星历时回退到默认项目范围 1900-2100
        assert!(r.start_mjd_utc < 15100.0, "start = {}", r.start_mjd_utc);
        assert!(r.end_mjd_utc > 88000.0, "end = {}", r.end_mjd_utc);
    }

    #[test]
    fn refresh_time_range_updates_after_register() {
        let conv = TimeConverter::default();
        let eph = EphemerisProvider::new();
        let cat = Catalog::empty();
        let mut core = AstroCore::new(conv, eph, cat);
        // 无星历时为默认范围
        let r0 = core.time_range();
        assert!(r0.start_mjd_utc < 15100.0);
        // 注册星历后范围更新为星历覆盖
        core.register_ephemeris(linear_eph(399, 51544.0, 51544.0 + 32.0));
        let r1 = core.time_range();
        assert!((r1.start_mjd_utc - 51544.0).abs() < 1e-6);
        assert!((r1.end_mjd_utc - (51544.0 + 32.0)).abs() < 1e-6);
    }

    #[test]
    fn refresh_time_range_multi_body_span() {
        let conv = TimeConverter::default();
        let mut eph = EphemerisProvider::new();
        eph.register(linear_eph(399, 51544.0, 51544.0 + 32.0));
        eph.register(linear_eph(10, 60000.0, 60000.0 + 100.0));
        let cat = Catalog::empty();
        let core = AstroCore::new(conv, eph, cat);
        let r = core.time_range();
        // 取所有段的全局 min(t_start)/max(t_end)
        assert!((r.start_mjd_utc - 51544.0).abs() < 1e-6);
        assert!((r.end_mjd_utc - (60000.0 + 100.0)).abs() < 1e-6);
    }
}
