//! 天体目录（设计文档第 13 节）。

use ephemeris_runtime::provider::Precision;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 资产等级（设计文档 2、28）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetTier {
    S,
    A,
    B,
    C,
}

/// 天体目录记录（设计文档 13.3）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyRecord {
    pub body_id: u64,
    pub body_type: String,
    pub parent_body_id: Option<u64>,
    pub name_zh: String,
    pub name_en: String,
    pub aliases: Vec<String>,
    pub discovery_info: Option<String>,
    pub mean_radius_km: f64,
    pub gm_km3s2: Option<f64>,
    pub mean_density: Option<f64>,
    pub albedo: Option<f64>,
    pub rotation_period_days: Option<f64>,
    pub orbital_period_days: Option<f64>,
    pub pole_ra_deg: Option<f64>,
    pub pole_dec_deg: Option<f64>,
    pub prime_meridian_model: Option<String>,
    pub ephemeris_provider: String,
    pub ephemeris_coverage: Option<(f64, f64)>,
    pub precision: Precision,
    pub asset_tier: AssetTier,
    pub content_ref: Option<String>,
    pub sources: Vec<String>,
}

/// 目录元数据（设计文档 13.1）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogMeta {
    pub snapshot_date: String,
    pub source_versions: Vec<String>,
}

/// 天体目录（设计文档 13、10.5）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub meta: CatalogMeta,
    pub bodies: BTreeMap<u64, BodyRecord>,
}

impl Catalog {
    pub fn empty() -> Self {
        Self {
            meta: CatalogMeta {
                snapshot_date: String::new(),
                source_versions: Vec::new(),
            },
            bodies: BTreeMap::new(),
        }
    }

    pub fn get(&self, body_id: u64) -> Option<&BodyRecord> {
        self.bodies.get(&body_id)
    }

    /// 按中文名搜索。
    pub fn find_by_name_zh(&self, name: &str) -> Vec<&BodyRecord> {
        self.bodies
            .values()
            .filter(|b| b.name_zh == name || b.aliases.contains(&name.to_string()))
            .collect()
    }

    /// 按英文名搜索。
    pub fn find_by_name_en(&self, name: &str) -> Vec<&BodyRecord> {
        self.bodies
            .values()
            .filter(|b| b.name_en.eq_ignore_ascii_case(name))
            .collect()
    }
}
