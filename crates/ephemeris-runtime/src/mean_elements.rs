//! 平均轨道根数提供器（FR-ASTRO-003 / 设计文档 14.4）。
//!
//! 对于没有 SPK/数值星历的其他卫星，使用源自 IAU/Natural Satellite
//! Bulletin 的平均轨道根数（mean orbital elements）计算位置。
//!
//! 重要约束（FR-ASTRO-004）：平均轨道根数产出的状态精度等级必须标记为
//! `Precision::P1`（近似轨道），不得被标识为高精度星历。
//!
//! 计算流程：
//! 1. 输入：body_id、TDB（MJD）、根数表条目。
//! 2. 由 M0 与周期推算平近点角 M = M0 + n·(t - t0)。
//! 3. Kepler 方程 M = E - e·sinE 迭代求解偏近点角 E。
//! 4. 真近点角 ν = 2·atan2(√(1+e)·sin(E/2), √(1-e)·cos(E/2))。
//! 5. 距离 r = a·(1 - e·cosE)。
//! 6. 在轨道平面内位置 (r·cosν, r·sinν, 0)，再依次绕 z、x、z 旋转
//!    ω、i、Ω 转换到父天体质心惯性系。
//! 7. 加上父天体位置（若有）得到最终坐标。

use crate::provider::{EphemerisQuery, EphemerisError, Precision, StateVector};
use coordinate_system::frame::ReferenceFrame;
use coordinate_system::math::Vec3d;
use serde::{Deserialize, Serialize};

/// 平均轨道根数（FR-ASTRO-003）。
///
/// 字段单位与约定：
/// - `semi_major_axis_km`：半长轴，km。
/// - `eccentricity`：偏心率（无量纲）。
/// - `inclination_deg`：倾角，度。
/// - `longitude_ascending_node_deg`：升交点经度，度。
/// - `argument_perihelion_deg`：近日点幅角，度。
/// - `mean_anomaly_deg_at_epoch`：参考时刻平近点角，度。
/// - `epoch_mjd`：参考时刻（TDB MJD）。
/// - `period_days`：轨道周期，天。
/// - `parent_body_id`：母星 body_id（用于位置合成）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MeanElements {
    pub body_id: u64,
    pub semi_major_axis_km: f64,
    pub eccentricity: f64,
    pub inclination_deg: f64,
    pub longitude_ascending_node_deg: f64,
    pub argument_perihelion_deg: f64,
    pub mean_anomaly_deg_at_epoch: f64,
    pub epoch_mjd: f64,
    pub period_days: f64,
    pub parent_body_id: u64,
}

impl MeanElements {
    /// 计算指定时刻的位置（相对母天体质心，单位 km）。
    ///
    /// 采用 Kepler 方程迭代求解；当 e ≥ 1 或周期 ≤ 0 时返回 NaN 位置
    /// （调用方应据此识别降级，不得把 NaN 当作高精度输出）。
    pub fn position_at(&self, tdb: f64) -> Vec3d {
        if self.eccentricity >= 1.0 || self.eccentricity < 0.0 || self.period_days <= 0.0 {
            return Vec3d {
                x: f64::NAN,
                y: f64::NAN,
                z: f64::NAN,
            };
        }

        let a = self.semi_major_axis_km;
        let e = self.eccentricity;
        let n = 360.0_f64.to_radians() / self.period_days; // rad/day
        let m0 = self.mean_anomaly_deg_at_epoch.to_radians();
        let m = m0 + n * (tdb - self.epoch_mjd);

        // Kepler 方程：M = E - e·sinE，牛顿迭代
        let mut ek = m;
        for _ in 0..50 {
            let f = ek - e * ek.sin() - m;
            let fp = 1.0 - e * ek.cos();
            let delta = f / fp;
            ek -= delta;
            if delta.abs() < 1e-12 {
                break;
            }
        }

        // 真近点角
        let nu = 2.0
            * ((1.0 + e).sqrt() * (ek / 2.0).sin())
                .atan2((1.0 - e).sqrt() * (ek / 2.0).cos());
        // 距离
        let r = a * (1.0 - e * ek.cos());

        // 轨道平面坐标（近日点方向为 x 轴）
        let xp = r * nu.cos();
        let yp = r * nu.sin();

        // 旋转到惯性系：先 ω（绕 z），再 i（绕 x），再 Ω（绕 z）
        let omega = self.argument_perihelion_deg.to_radians();
        let inc = self.inclination_deg.to_radians();
        let big_omega = self.longitude_ascending_node_deg.to_radians();

        // 第一步：绕 z 旋转 ω
        let x1 = xp * omega.cos() - yp * omega.sin();
        let y1 = xp * omega.sin() + yp * omega.cos();
        // 第二步：绕 x 旋转 i
        let x2 = x1;
        let z2 = -y1 * inc.sin();
        let y2 = y1 * inc.cos();
        // 第三步：绕 z 旋转 Ω
        let x = x2 * big_omega.cos() - y2 * big_omega.sin();
        let y = x2 * big_omega.sin() + y2 * big_omega.cos();
        let z = z2;

        Vec3d { x, y, z }
    }

    /// 数值差分计算速度（km/day）。步长取周期的 1e-4。
    pub fn velocity_at(&self, tdb: f64) -> Vec3d {
        let h = (self.period_days * 1e-4).max(1e-6);
        let p1 = self.position_at(tdb + h);
        let p0 = self.position_at(tdb - h);
        Vec3d {
            x: (p1.x - p0.x) / (2.0 * h),
            y: (p1.y - p0.y) / (2.0 * h),
            z: (p1.z - p0.z) / (2.0 * h),
        }
    }
}

/// 平均轨道根数提供器（FR-ASTRO-003）。
///
/// 注册一组卫星的平均轨道根数，按 body_id 查询。
/// 输出的 StateVector 始终标记为 Precision::P1（FR-ASTRO-004），
/// 不得被冒充为高精度星历。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MeanElementsProvider {
    pub elements: std::collections::BTreeMap<u64, MeanElements>,
}

impl MeanElementsProvider {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册一组平均轨道根数。
    pub fn register(&mut self, e: MeanElements) {
        self.elements.insert(e.body_id, e);
    }

    /// 是否支持某天体。
    pub fn supports(&self, body_id: u64) -> bool {
        self.elements.contains_key(&body_id)
    }

    /// 求值天体状态（相对母天体质心，单位 km / km·day⁻¹）。
    ///
    /// 返回值 frame 为 BodyBarycentric（母天体质心惯性系）；
    /// 调用方负责加上母天体位置转换到日心或太阳系质心系。
    pub fn get_state(&self, body_id: u64, tdb: f64) -> EphemerisQuery {
        match self.elements.get(&body_id) {
            Some(e) => {
                let position = e.position_at(tdb);
                let velocity = e.velocity_at(tdb);
                if position.x.is_nan() || position.y.is_nan() || position.z.is_nan() {
                    EphemerisQuery::OutOfRange {
                        body_id,
                        tdb,
                        fallback: None,
                    }
                } else {
                    EphemerisQuery::Ok(StateVector {
                        position,
                        velocity,
                        frame: ReferenceFrame::BodyBarycentric,
                        // FR-ASTRO-004：平均轨道根数不得被标识为高精度星历。
                        precision: Precision::P1,
                    })
                }
            }
            None => EphemerisQuery::OutOfRange {
                body_id,
                tdb,
                fallback: None,
            },
        }
    }

    /// 返回根数条目（供 UI 显示来源精度，FR-ASTRO-004 / FR-CONTENT-004）。
    pub fn get_elements(&self, body_id: u64) -> Option<&MeanElements> {
        self.elements.get(&body_id)
    }

    /// 列出所有已注册的 body_id（供运行时探测降级）。
    pub fn registered_ids(&self) -> Vec<u64> {
        self.elements.keys().copied().collect()
    }

    /// 估算给定天体的星历覆盖范围（平均轨道根数视为全期可用）。
    pub fn coverage(&self, body_id: u64) -> Option<(f64, f64)> {
        if self.elements.contains_key(&body_id) {
            // 平均根数没有时间边界（理论全期），返回宽范围供上层判断
            Some((15_020.0, 88_069.0))
        } else {
            None
        }
    }

    /// 与 [EphemerisError] 兼容的查询接口。
    pub fn evaluate(&self, body_id: u64, tdb: f64) -> Result<EphemerisQuery, EphemerisError> {
        Ok(self.get_state(body_id, tdb))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn circular_elements(body_id: u64, a: f64, period: f64) -> MeanElements {
        MeanElements {
            body_id,
            semi_major_axis_km: a,
            eccentricity: 0.0,
            inclination_deg: 0.0,
            longitude_ascending_node_deg: 0.0,
            argument_perihelion_deg: 0.0,
            mean_anomaly_deg_at_epoch: 0.0,
            epoch_mjd: 51_544.0,
            period_days: period,
            parent_body_id: 10,
        }
    }

    fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn circular_orbit_returns_to_start_after_one_period() {
        let e = circular_elements(501, 421_700.0, 1.769);
        let p0 = e.position_at(51_544.0);
        let p1 = e.position_at(51_544.0 + 1.769);
        assert!(approx_eq(p0.x, p1.x, 1e-3), "x: {} vs {}", p0.x, p1.x);
        assert!(approx_eq(p0.y, p1.y, 1e-3), "y: {} vs {}", p0.y, p1.y);
        assert!(approx_eq(p0.z, p1.z, 1e-3), "z: {} vs {}", p0.z, p1.z);
    }

    #[test]
    fn circular_orbit_radius_constant() {
        let e = circular_elements(501, 421_700.0, 1.769);
        let p = e.position_at(51_544.0 + 0.5);
        let r = (p.x * p.x + p.y * p.y + p.z * p.z).sqrt();
        assert!(approx_eq(r, 421_700.0, 1e-3), "r={r}");
    }

    #[test]
    fn provider_marks_mean_elements_as_p1() {
        // FR-ASTRO-004：平均轨道根数不得被标识为高精度星历。
        let mut p = MeanElementsProvider::new();
        p.register(circular_elements(501, 421_700.0, 1.769));
        match p.get_state(501, 51_544.0) {
            EphemerisQuery::Ok(s) => assert_eq!(s.precision, Precision::P1),
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[test]
    fn unknown_body_returns_out_of_range() {
        let p = MeanElementsProvider::new();
        assert!(matches!(
            p.get_state(999, 51_544.0),
            EphemerisQuery::OutOfRange { .. }
        ));
    }

    #[test]
    fn elliptical_orbit_perihelion_distance_correct() {
        // e=0.5, a=1000 → perihelion = 500
        let e = MeanElements {
            body_id: 999,
            semi_major_axis_km: 1000.0,
            eccentricity: 0.5,
            inclination_deg: 0.0,
            longitude_ascending_node_deg: 0.0,
            argument_perihelion_deg: 0.0,
            mean_anomaly_deg_at_epoch: 0.0, // M=0 → 位于近日点
            epoch_mjd: 51_544.0,
            period_days: 100.0,
            parent_body_id: 10,
        };
        let p = e.position_at(51_544.0);
        let r = (p.x * p.x + p.y * p.y + p.z * p.z).sqrt();
        assert!(approx_eq(r, 500.0, 1e-6), "perihelion r={r}");
    }

    #[test]
    fn inclination_rotates_z_component() {
        // i=90°, M=90° → 真近点角 90° → y方向；i=90° 把 y 旋转到 z
        let e = MeanElements {
            body_id: 998,
            semi_major_axis_km: 1000.0,
            eccentricity: 0.0,
            inclination_deg: 90.0,
            longitude_ascending_node_deg: 0.0,
            argument_perihelion_deg: 0.0,
            mean_anomaly_deg_at_epoch: 90.0,
            epoch_mjd: 51_544.0,
            period_days: 100.0,
            parent_body_id: 10,
        };
        let p = e.position_at(51_544.0);
        assert!(p.x.abs() < 1e-6, "x should be ~0, got {}", p.x);
        assert!(p.z.abs() > 900.0, "z should be ~1000, got {}", p.z);
    }

    #[test]
    fn hyperbolic_orbit_returns_nan_position() {
        let mut p = MeanElementsProvider::new();
        p.register(MeanElements {
            body_id: 997,
            semi_major_axis_km: 1000.0,
            eccentricity: 1.5, // 双曲
            inclination_deg: 0.0,
            longitude_ascending_node_deg: 0.0,
            argument_perihelion_deg: 0.0,
            mean_anomaly_deg_at_epoch: 0.0,
            epoch_mjd: 51_544.0,
            period_days: 100.0,
            parent_body_id: 10,
        });
        match p.get_state(997, 51_544.0) {
            EphemerisQuery::OutOfRange { fallback, .. } => assert!(fallback.is_none()),
            other => panic!("expected OutOfRange for hyperbolic, got {other:?}"),
        }
    }

    #[test]
    fn coverage_returns_full_range_for_registered_body() {
        let mut p = MeanElementsProvider::new();
        p.register(circular_elements(501, 421_700.0, 1.769));
        let cov = p.coverage(501).expect("coverage should be Some");
        assert_eq!(cov.0, 15_020.0);
        assert_eq!(cov.1, 88_069.0);
        assert!(p.coverage(999).is_none());
    }

    #[test]
    fn registered_ids_lists_all_bodies() {
        let mut p = MeanElementsProvider::new();
        p.register(circular_elements(501, 421_700.0, 1.769));
        p.register(circular_elements(606, 1_221_830.0, 15.945));
        let ids = p.registered_ids();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&501));
        assert!(ids.contains(&606));
    }

    #[test]
    fn velocity_nonzero_for_circular_orbit() {
        let e = circular_elements(501, 421_700.0, 1.769);
        let v = e.velocity_at(51_544.0 + 0.25);
        let speed = (v.x * v.x + v.y * v.y + v.z * v.z).sqrt();
        // 圆轨道速度 ≈ 2π·a/T = 2π·421700/1.769 ≈ 1,498,000 km/day
        assert!(speed > 1.0e6, "speed={speed} too low");
        assert!(speed < 2.0e6, "speed={speed} too high");
    }

    #[test]
    fn get_elements_returns_registered_entry() {
        let mut p = MeanElementsProvider::new();
        p.register(circular_elements(501, 421_700.0, 1.769));
        let entry = p.get_elements(501).expect("entry should exist");
        assert_eq!(entry.body_id, 501);
        assert_eq!(entry.parent_body_id, 10);
        assert!(p.get_elements(999).is_none());
    }
}
