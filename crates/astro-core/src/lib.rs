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
        Self {
            converter,
            ephemeris,
            catalog,
            time_range: TimeRange::default(),
        }
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

    /// 轨道线自适应步长采样（设计文档 14.4）。
    ///
    /// 在 [t_start, t_end]（UTC MJD）范围内对 bodyId 采样状态位置，返回 (tdb_mjd, position) 列表。
    /// 曲率高/近日点附近加密此处以步长自适应简化实现。
    pub fn sample_orbit(
        &self,
        body_id: u64,
        t_start_utc: f64,
        t_end_utc: f64,
        base_step_days: f64,
    ) -> Result<Vec<(f64, Vec3d)>, AstroError> {
        let mut out = Vec::new();
        let mut t = t_start_utc;
        while t <= t_end_utc {
            let utc = JulianDate::new(t, time_system::scale::TimeScale::Utc);
            let tdb = self.converter.to_tdb(utc);
            match self.ephemeris.get_state(body_id, tdb.mjd) {
                EphemerisQuery::Ok(s) => out.push((tdb.mjd, s.position)),
                EphemerisQuery::OutOfRange { .. } => {
                    // 超范围停止采样，不伪造（FR-ASTRO-004）
                    break;
                }
            }
            t += base_step_days;
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
}
