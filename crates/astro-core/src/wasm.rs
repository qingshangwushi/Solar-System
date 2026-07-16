//! WASM 绑定（设计文档 9.1：天文内核 = Rust/WASM + Web Worker）。
//!
//! 暴露给 JS 的精简接口，使用 serde-wasm-bindgen 序列化复杂类型。
//! 复杂状态通过 JsValue 传递，可由 Worker 转为可转移 ArrayBuffer。

use crate::{catalog::Catalog, AstroCore, AstroError};
use ephemeris_runtime::provider::{BodyEphemeris, EphemerisProvider};
use js_sys::Float64Array;
use time_system::leap_seconds::LeapSecondTable;
use time_system::scale::TimeScale;
use time_system::time::{JulianDate, TimeConverter};
use wasm_bindgen::prelude::*;

/// WASM 内核句柄（设计文档 42 节接口的 WASM 实现）。
#[wasm_bindgen]
pub struct AstroCoreWasm {
    inner: AstroCore,
}

#[wasm_bindgen]
impl AstroCoreWasm {
    /// 构造默认内核（内置闰秒表 + 空星历 + 空目录）。
    #[wasm_bindgen(constructor)]
    pub fn new() -> AstroCoreWasm {
        let converter = TimeConverter::with_leap_seconds(LeapSecondTable::official());
        let ephemeris = EphemerisProvider::new();
        let catalog = Catalog::empty();
        AstroCoreWasm {
            inner: AstroCore::new(converter, ephemeris, catalog),
        }
    }

    /// 注册一段星历（用于离线冒烟，设计文档 P0-7 内置地月样本）。
    /// `body_json` 为 serde_json 序列化的 BodyEphemeris。
    #[wasm_bindgen(js_name = registerEphemeris)]
    pub fn register_ephemeris(&mut self, body_json: &str) -> Result<(), JsValue> {
        let body: BodyEphemeris =
            serde_json::from_str(body_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.inner.ephemeris_mut().register(body);
        Ok(())
    }

    /// 求值单个天体在 UTC MJD 时刻的状态（设计文档 42.2 evaluateState）。
    /// 返回 serde-wasm-bindgen 序列化的 BodyState。
    #[wasm_bindgen(js_name = evaluateState)]
    pub fn evaluate_state(&self, body_id: u64, utc_mjd: f64) -> Result<JsValue, JsValue> {
        let utc = JulianDate::new(utc_mjd, TimeScale::Utc);
        let state = self
            .inner
            .evaluate_state(body_id, utc)
            .map_err(map_astro_error)?;
        serde_wasm_bindgen::to_value(&state).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 求值多天体快照（设计文档 42.3）。
    /// `body_ids` 为 JS 数组，返回 CelestialStateSnapshot。
    #[wasm_bindgen(js_name = evaluateSnapshot)]
    pub fn evaluate_snapshot(&self, body_ids: &[u64], utc_mjd: f64) -> Result<JsValue, JsValue> {
        let utc = JulianDate::new(utc_mjd, TimeScale::Utc);
        let snapshot = self
            .inner
            .evaluate_snapshot(body_ids, utc)
            .map_err(map_astro_error)?;
        serde_wasm_bindgen::to_value(&snapshot).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 轨道采样（设计文档 14.4），返回 Float64Array 平铺数组：
    /// [tdb0, x0, y0, z0, tdb1, x1, y1, z1, ...]
    #[wasm_bindgen(js_name = sampleOrbit)]
    pub fn sample_orbit(
        &self,
        body_id: u64,
        t_start_utc: f64,
        t_end_utc: f64,
        base_step_days: f64,
    ) -> Result<Float64Array, JsValue> {
        let samples = self
            .inner
            .sample_orbit(body_id, t_start_utc, t_end_utc, base_step_days)
            .map_err(map_astro_error)?;
        let mut flat = Vec::with_capacity(samples.len() * 4);
        for (t, p) in samples {
            flat.push(t);
            flat.push(p.x);
            flat.push(p.y);
            flat.push(p.z);
        }
        Ok(Float64Array::from(&flat[..]))
    }

    /// 时间范围下界（UTC MJD）。
    #[wasm_bindgen(js_name = timeRangeMin)]
    pub fn time_range_min(&self) -> f64 {
        self.inner.time_range().start_mjd_utc
    }

    /// 时间范围上界（UTC MJD）。
    #[wasm_bindgen(js_name = timeRangeMax)]
    pub fn time_range_max(&self) -> f64 {
        self.inner.time_range().end_mjd_utc
    }
}

impl Default for AstroCoreWasm {
    fn default() -> Self {
        Self::new()
    }
}

fn map_astro_error(e: AstroError) -> JsValue {
    let code = match &e {
        AstroError::Time(_) => "OUT_OF_RANGE",
        AstroError::NoEphemeris(_) => "UNSUPPORTED",
        AstroError::NotInCatalog(_) => "UNSUPPORTED",
    };
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"code".into(), &JsValue::from_str(code)).ok();
    js_sys::Reflect::set(&obj, &"message_zh".into(), &JsValue::from_str(&e.to_string())).ok();
    obj.into()
}
