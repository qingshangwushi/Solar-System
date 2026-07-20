//! 卫星食与卫星凌越计算（FR-EVENT-003 / 设计文档 16.3、16.5）。
//!
//! 盘面重叠事件——目标函数（设计文档 16.3）：
//! - 卫星凌越（SatelliteTransit）：卫星 A 在母星 B 与观察者 C 之间穿过，
//!   即 B-C 连线与 A-B 距离小于 (r_A + r_B)。
//!   目标函数 f(t) = sep(t) - (r_A + r_B)，求根（f=0）得到接触/离开时刻。
//! - 卫星食（SatelliteEclipse）：卫星进入母星的本影/半影锥。
//!   目标函数 f(t) = umbra_distance(t)，求根得到进出影时刻。
//!
//! 求根使用 `root::find_root`（粗扫 + 二分精化），与既有事件计算流程一致。
//! 事件结果通过 `EventRecord` 输出，包含 begin/maximum/end 三时刻与几何参数。

use crate::root::{find_root, RootResult};
use crate::types::{EventId, EventPhase, EventPrecision, EventRecord, EventType};
use coordinate_system::frame::ReferenceFrame;
use coordinate_system::math::Vec3d;
use std::collections::BTreeMap;

/// 卫星位置求值器：返回指定 TDB 时刻卫星相对母天体质心的位置（km）。
pub type PositionEvaluator = Box<dyn Fn(f64) -> Vec3d + Send + Sync>;

/// 卫星事件计算输入。
pub struct SatelliteEventInput {
    /// 卫星 body_id。
    pub satellite_id: u64,
    /// 母天体 body_id（如木星、土星）。
    pub parent_id: u64,
    /// 观察者 body_id（通常为地球 399 或太阳 10）。
    pub observer_id: u64,
    /// 卫星位置求值器（相对母天体质心，km）。
    pub satellite_position: PositionEvaluator,
    /// 母天体位置求值器（相对太阳系质心，km）。
    pub parent_position: PositionEvaluator,
    /// 观察者位置求值器（相对太阳系质心，km）。
    pub observer_position: PositionEvaluator,
    /// 卫星半径（km）。
    pub satellite_radius_km: f64,
    /// 母天体半径（km）。
    pub parent_radius_km: f64,
    /// 母天体到太阳的距离（km，用于本影锥计算）。
    pub parent_sun_distance_km: f64,
    /// 太阳半径（km，默认 695700）。
    pub sun_radius_km: f64,
}

/// 卫星凌越/食的求解结果（含接触时刻序列与几何参数）。
#[derive(Debug, Clone)]
pub struct SatelliteEventSolution {
    pub event_type: EventType,
    pub satellite_id: u64,
    pub parent_id: u64,
    pub observer_id: u64,
    /// 第一接触时刻（TDB MJD）。
    pub t_begin: f64,
    /// 中心时刻（TDB MJD，最接近中心时刻）。
    pub t_maximum: f64,
    /// 最后接触时刻（TDB MJD）。
    pub t_end: f64,
    /// 最小分离角（弧度）。
    pub min_separation_rad: f64,
    /// 接触时刻卫星与母星视线距离（km）。
    pub contact_distance_km: f64,
}

impl SatelliteEventSolution {
    fn to_record(&self, frame: ReferenceFrame) -> EventRecord {
        let mut geometry = BTreeMap::new();
        geometry.insert("min_separation_rad".to_string(), self.min_separation_rad);
        geometry.insert("contact_distance_km".to_string(), self.contact_distance_km);
        geometry.insert(
            "duration_seconds".to_string(),
            (self.t_end - self.t_begin) * 86400.0,
        );
        EventRecord {
            id: EventId(format!(
                "{:?}-{}-{}-{:.6}",
                self.event_type, self.satellite_id, self.parent_id, self.t_maximum
            )),
            event_type: self.event_type,
            participants: vec![self.satellite_id, self.parent_id, self.observer_id],
            phase: EventPhase {
                begin: self.t_begin,
                maximum: self.t_maximum,
                end: self.t_end,
            },
            frame,
            precision: EventPrecision::Geometric,
            geometry,
            uncertainty_seconds: 60.0, // 几何档默认 1 分钟
            recommended_camera_target: Some(self.satellite_id),
            recommended_time_rate: 3600.0, // 1 小时/秒
        }
    }
}

/// 在 [t_start, t_end] 内搜索卫星凌越事件。
///
/// 凌越判定：卫星-母星-观察者三者近共线，且卫星与母星视角分离小于
/// (卫星视半径 + 母星视半径)。目标函数：
/// ```text
/// f(t) = sep_angular(t) - (angular_radius_sat + angular_radius_parent)
/// ```
/// 求根（f=0）得到第一/最后接触时刻；中间取 f 最小值为极大时刻。
pub fn find_satellite_transits(
    input: &SatelliteEventInput,
    t_start: f64,
    t_end: f64,
    step_days: f64,
) -> Vec<SatelliteEventSolution> {
    let mut solutions = Vec::new();

    // 目标函数：sep_angular - (angular_radius_sat + angular_radius_parent)
    let f = |t: f64| -> f64 {
        let sat_pos = (input.satellite_position)(t);
        let parent_pos = (input.parent_position)(t);
        let obs_pos = (input.observer_position)(t);
        // 卫星相对观察者位置
        let sat_obs = Vec3d {
            x: parent_pos.x + sat_pos.x - obs_pos.x,
            y: parent_pos.y + sat_pos.y - obs_pos.y,
            z: parent_pos.z + sat_pos.z - obs_pos.z,
        };
        // 母星相对观察者位置
        let parent_obs = Vec3d {
            x: parent_pos.x - obs_pos.x,
            y: parent_pos.y - obs_pos.y,
            z: parent_pos.z - obs_pos.z,
        };
        let sat_dist = (sat_obs.x * sat_obs.x + sat_obs.y * sat_obs.y + sat_obs.z * sat_obs.z).sqrt();
        let parent_dist =
            (parent_obs.x * parent_obs.x + parent_obs.y * parent_obs.y + parent_obs.z * parent_obs.z)
                .sqrt();
        if sat_dist < 1.0 || parent_dist < 1.0 {
            return f64::MAX;
        }
        // 角分离（点积反余弦）
        let dot = (sat_obs.x * parent_obs.x + sat_obs.y * parent_obs.y + sat_obs.z * parent_obs.z)
            / (sat_dist * parent_dist);
        let dot_clamped = dot.clamp(-1.0, 1.0);
        let sep = dot_clamped.acos();
        // 视半径之和
        let r_sat = (input.satellite_radius_km / sat_dist).atan();
        let r_parent = (input.parent_radius_km / parent_dist).atan();
        sep - (r_sat + r_parent)
    };

    // 粗扫找极小值区间
    let mut t = t_start;
    let mut prev_f = f(t);
    let mut in_event = false;
    let mut event_start = t_start;
    let mut min_f = f64::MAX;
    let mut min_t = t_start;

    while t < t_end {
        let next = (t + step_days).min(t_end);
        let cur_f = f(next);

        if prev_f > 0.0 && cur_f <= 0.0 && !in_event {
            // 进入凌越
            in_event = true;
            // 用二分精化进入时刻
            match find_root(t, next, step_days / 20.0, 1e-8, &f) {
                RootResult::Found(t_in) => event_start = t_in,
                RootResult::NoSignChange => event_start = t,
            }
            min_f = f64::MAX;
        }

        if in_event {
            if cur_f < min_f {
                min_f = cur_f;
                min_t = next;
            }
            if prev_f <= 0.0 && cur_f > 0.0 {
                // 退出凌越
                in_event = false;
                let event_end = match find_root(t, next, step_days / 20.0, 1e-8, &f) {
                    RootResult::Found(t_out) => t_out,
                    RootResult::NoSignChange => next,
                };
                solutions.push(SatelliteEventSolution {
                    event_type: EventType::SatelliteTransit,
                    satellite_id: input.satellite_id,
                    parent_id: input.parent_id,
                    observer_id: input.observer_id,
                    t_begin: event_start,
                    t_maximum: min_t,
                    t_end: event_end,
                    min_separation_rad: min_f.abs(),
                    contact_distance_km: 0.0,
                });
            }
        }

        t = next;
        prev_f = cur_f;
    }

    solutions
}

/// 在 [t_start, t_end] 内搜索卫星食事件（卫星进入母天体本影锥）。
///
/// 本影锥几何（简化）：
/// - 母星到太阳的距离 D = parent_sun_distance
/// - 本影锥半角 α = asin((R_sun - R_parent) / D)
/// - 本影锥长度 L = R_parent / sin(α)（若 α ≤ 0 视为无穷远，无全食）
///
/// 目标函数：f(t) = distance_from_satellite_to_umbra_axis(t) - umbra_radius_at_satellite(t)
/// 求根（f=0）得到进出影时刻。
pub fn find_satellite_eclipses(
    input: &SatelliteEventInput,
    t_start: f64,
    t_end: f64,
    step_days: f64,
) -> Vec<SatelliteEventSolution> {
    let mut solutions = Vec::new();

    // 本影锥几何
    let r_sun = input.sun_radius_km;
    let r_parent = input.parent_radius_km;
    let d_parent_sun = input.parent_sun_distance_km.max(1.0);
    // 本影锥半角（取绝对值避免 R_sun < R_parent 时负数）
    let alpha = ((r_sun - r_parent).abs() / d_parent_sun).asin();
    // 本影锥长度（α=0 表示平行光，无有限本影）
    let umbra_length = if alpha > 1e-10 {
        r_parent / alpha.sin()
    } else {
        // 平行光近似：本影无限长，半径恒等于 R_parent
        f64::INFINITY
    };

    // 目标函数：到本影轴距离 - 本影半径（在该距离处）
    let f = |t: f64| -> f64 {
        let sat_pos = (input.satellite_position)(t);
        let parent_pos = (input.parent_position)(t);
        // 太阳方向（从母星指向太阳）
        let sun_dir = Vec3d {
            x: -parent_pos.x,
            y: -parent_pos.y,
            z: -parent_pos.z,
        };
        let sun_dist = (sun_dir.x * sun_dir.x + sun_dir.y * sun_dir.y + sun_dir.z * sun_dir.z).sqrt();
        if sun_dist < 1.0 {
            return f64::MAX;
        }
        let sun_dir_n = Vec3d {
            x: sun_dir.x / sun_dist,
            y: sun_dir.y / sun_dist,
            z: sun_dir.z / sun_dist,
        };
        // 卫星相对母星位置（sat_pos 已经是相对母星，无需再加 parent_pos）
        let sat_rel = sat_pos;
        // 沿太阳方向的投影（卫星在本影锥的轴向位置）
        let proj = sat_rel.x * sun_dir_n.x + sat_rel.y * sun_dir_n.y + sat_rel.z * sun_dir_n.z;
        // 卫星到本影轴的垂直距离
        let perp = Vec3d {
            x: sat_rel.x - proj * sun_dir_n.x,
            y: sat_rel.y - proj * sun_dir_n.y,
            z: sat_rel.z - proj * sun_dir_n.z,
        };
        let perp_dist = (perp.x * perp.x + perp.y * perp.y + perp.z * perp.z).sqrt();

        // 若卫星在母星背向太阳的一侧（proj > 0）才算可能进入本影
        if proj < 0.0 {
            return 1.0; // 在母星朝向太阳一侧，不在影中
        }
        // 若超出本影锥长度，无全食
        if proj > umbra_length {
            return 1.0;
        }
        // 本影在该 proj 处的半径
        let umbra_radius_at = (r_parent - proj * alpha.sin()).max(0.0);
        perp_dist - umbra_radius_at
    };

    // 粗扫找符号变化
    let mut t = t_start;
    let mut prev_f = f(t);
    let mut in_event = false;
    let mut event_start = t_start;
    let mut min_f = f64::MAX;
    let mut min_t = t_start;

    while t < t_end {
        let next = (t + step_days).min(t_end);
        let cur_f = f(next);

        if prev_f > 0.0 && cur_f <= 0.0 && !in_event {
            in_event = true;
            match find_root(t, next, step_days / 20.0, 1e-8, &f) {
                RootResult::Found(t_in) => event_start = t_in,
                RootResult::NoSignChange => event_start = t,
            }
            min_f = f64::MAX;
        }

        if in_event {
            if cur_f < min_f {
                min_f = cur_f;
                min_t = next;
            }
            if prev_f <= 0.0 && cur_f > 0.0 {
                in_event = false;
                let event_end = match find_root(t, next, step_days / 20.0, 1e-8, &f) {
                    RootResult::Found(t_out) => t_out,
                    RootResult::NoSignChange => next,
                };
                solutions.push(SatelliteEventSolution {
                    event_type: EventType::SatelliteEclipse,
                    satellite_id: input.satellite_id,
                    parent_id: input.parent_id,
                    observer_id: input.observer_id,
                    t_begin: event_start,
                    t_maximum: min_t,
                    t_end: event_end,
                    min_separation_rad: 0.0,
                    contact_distance_km: min_f.abs(),
                });
            }
        }

        t = next;
        prev_f = cur_f;
    }

    solutions
}

/// 把求解结果转为事件记录（设计文档 16.5）。
pub fn solution_to_record(sol: &SatelliteEventSolution) -> EventRecord {
    sol.to_record(ReferenceFrame::HeliocentricInertial)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_circular_evaluator(radius_km: f64, period_days: f64, phase_rad: f64) -> PositionEvaluator {
        Box::new(move |t: f64| {
            let theta = phase_rad + 2.0 * std::f64::consts::PI * (t - 51544.0) / period_days;
            Vec3d {
                x: radius_km * theta.cos(),
                y: radius_km * theta.sin(),
                z: 0.0,
            }
        })
    }

    #[test]
    fn transit_detected_when_satellite_crosses_parent_observer_line() {
        // 卫星在 (radius, 0) 绕母星，观察者沿 -x 方向远端
        // 当卫星位于母星朝向观察者一侧（x < 0）时发生凌越
        let sat_eval = make_circular_evaluator(421_700.0, 1.769, 0.0);
        let parent_eval = Box::new(|_t: f64| Vec3d::new(778_500_000.0 * 0.0, 0.0, 0.0)) as PositionEvaluator;
        // 观察者在 -x 方向（地球）使母星-观察者连线沿 -x
        let obs_eval = Box::new(|_t: f64| Vec3d::new(-1.0e8, 0.0, 0.0)) as PositionEvaluator;

        let input = SatelliteEventInput {
            satellite_id: 501,
            parent_id: 599,
            observer_id: 399,
            satellite_position: sat_eval,
            parent_position: parent_eval,
            observer_position: obs_eval,
            satellite_radius_km: 1821.6,
            parent_radius_km: 69_911.0,
            parent_sun_distance_km: 778_500_000.0,
            sun_radius_km: 695_700.0,
        };

        // 卫星周期 1.769 天 → 半周期 0.8845 天后位于母星朝向观察者一侧
        let transits = find_satellite_transits(&input, 51544.0, 51544.0 + 5.0, 0.05);
        // 至少应找到一次凌越
        assert!(!transits.is_empty(), "expected at least one transit");
        let first = &transits[0];
        assert!(first.t_end > first.t_begin, "end must be after begin");
        // 极大时刻应在 0.8845 附近（卫星穿越母星-观察者连线时）
        let expected_max = 51544.0 + 0.8845;
        assert!(
            (first.t_maximum - expected_max).abs() < 0.2,
            "t_maximum={} expected~{expected_max}",
            first.t_maximum
        );
    }

    #[test]
    fn eclipse_detected_when_satellite_enters_umbra() {
        // 母星位于原点，太阳在 +x 远端（阳光沿 -x 入射）
        // 本影锥沿 -x 方向（背向太阳）
        // 卫星在 (radius*cos, radius*sin, 0) 圆轨道
        // 当 proj > 0（卫星位于 -x 方向，母星背阳侧）且 perp_dist < umbra_radius 时进入本影
        let sat_eval = make_circular_evaluator(421_700.0, 1.769, 0.0);
        // 母星固定在 (1.5e8, 0, 0)（朝向 +x 太阳）
        let parent_pos = Vec3d::new(1.5e8, 0.0, 0.0);
        let parent_eval = Box::new(move |_t: f64| parent_pos) as PositionEvaluator;
        let obs_eval = Box::new(|_t: f64| Vec3d::new(0.0, 0.0, 0.0)) as PositionEvaluator;

        let input = SatelliteEventInput {
            satellite_id: 501,
            parent_id: 599,
            observer_id: 399,
            satellite_position: sat_eval,
            parent_position: parent_eval,
            observer_position: obs_eval,
            satellite_radius_km: 1821.6,
            parent_radius_km: 69_911.0,
            parent_sun_distance_km: 1.5e8,
            sun_radius_km: 695_700.0,
        };

        let eclipses = find_satellite_eclipses(&input, 51544.0, 51544.0 + 5.0, 0.05);
        // 木星半径 69911 km，本影锥长约 69911 / sin(asin((695700-69911)/1.5e8))
        //   = 69911 / ((625789)/1.5e8) ≈ 69911 / 0.00417 ≈ 16.77e6 km
        // 卫星轨道半径 421700 km，远在本影锥范围内
        // 卫星每周期进入本影一次（半周期 0.8845 天）
        assert!(!eclipses.is_empty(), "expected at least one eclipse");
        let first = &eclipses[0];
        assert!(first.t_end > first.t_begin, "end must be after begin");
    }

    #[test]
    fn solution_to_record_preserves_geometry() {
        let sol = SatelliteEventSolution {
            event_type: EventType::SatelliteTransit,
            satellite_id: 501,
            parent_id: 599,
            observer_id: 399,
            t_begin: 51544.0,
            t_maximum: 51544.5,
            t_end: 51545.0,
            min_separation_rad: 0.001,
            contact_distance_km: 5000.0,
        };
        let rec = solution_to_record(&sol);
        assert_eq!(rec.event_type, EventType::SatelliteTransit);
        assert_eq!(rec.participants, vec![501, 599, 399]);
        assert_eq!(rec.phase.begin, 51544.0);
        assert_eq!(rec.phase.maximum, 51544.5);
        assert_eq!(rec.phase.end, 51545.0);
        assert!(rec.geometry.contains_key("min_separation_rad"));
        assert!(rec.geometry.contains_key("contact_distance_km"));
        assert!(rec.geometry.contains_key("duration_seconds"));
    }
}
