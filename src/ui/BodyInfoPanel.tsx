import { useState } from "react";
import type { CelestialObject } from "../astronomy/types";

interface Props { body: CelestialObject; distanceKm?: number; positionMode: string; }
const labels: Record<CelestialObject["type"], string> = { star: "Star · 恒星", planet: "Planet · 行星", dwarfPlanet: "Dwarf planet · 矮行星", moon: "Natural satellite · 天然卫星", asteroid: "Minor planet · 小行星", comet: "Comet · 彗星", centaur: "Centaur · 半人马小行星", tno: "Trans-Neptunian object · 海王星外天体", spacecraft: "Spacecraft · 探测器" };
const format = (value: number | undefined, unit: string) => value === undefined || !Number.isFinite(value) ? "暂无可靠数据" : `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)} ${unit}`;

export function BodyInfoPanel({ body, distanceKm, positionMode }: Props) {
  const [tab, setTab] = useState<"overview" | "orbit" | "physical" | "science">("overview");
  const parent = body.parentId;
  const orbitPeriodDays = body.orbit && parent ? (() => {
    const parentMass = body.type === "moon" ? (parent === "earth" ? 5.97237e24 : parent === "jupiter" ? 1.8982e27 : parent === "saturn" ? 5.6834e26 : parent === "neptune" ? 1.02413e26 : undefined) : 1.98847e30;
    if (!parentMass) return undefined;
    return 2 * Math.PI * Math.sqrt(Math.abs(body.orbit!.semiMajorAxisKm) ** 3 / (6.67430e-20 * parentMass)) / 86_400;
  })() : undefined;
  const density = body.densityKgM3 ?? (body.massKg && body.radiusKm ? body.massKg / (4 / 3 * Math.PI * (body.radiusKm * 1000) ** 3) : undefined);
  const selectedTab = (key: typeof tab, label: string) => <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? "detail-tab active" : "detail-tab"} onClick={() => setTab(key)}>{label}</button>;
  return <aside className="detail-panel panel" aria-label="Selected body information">
    <div className="detail-topline"><span className={`detail-mark type-${body.type}`} /><span>{labels[body.type]}</span><span className="detail-id">{body.id}</span></div>
    <div className={`object-preview type-${body.type}`} aria-label="Illustrative colour preview; no measured map is bundled"><span>{body.name.slice(0, 1).toUpperCase()}</span><small>ILLUSTRATIVE PREVIEW</small></div>
    <h2>{body.name}</h2>
    {body.officialName && body.officialName !== body.name && <p className="official-name">{body.officialName}</p>}
    <p className="detail-blurb">{body.type === "star" ? "The star at the center of our planetary system." : parent ? `Orbits ${parent}.` : "A member of the Solar System."}</p>
    <div className="detail-tabs" role="tablist" aria-label="Body data sections">{selectedTab("overview", "Overview")}{selectedTab("orbit", "Orbit")}{selectedTab("physical", "Physical")}{selectedTab("science", "Science")}</div>
    <div className="detail-tab-content" role="tabpanel">
      {tab === "overview" && <div className="fact-grid"><div><span>TYPE</span><strong>{labels[body.type]}</strong></div><div><span>FROM SUN</span><strong>{format(distanceKm, "km")}</strong></div><div><span>RADIUS</span><strong>{format(body.radiusKm, "km")}</strong></div><div><span>MASS</span><strong>{format(body.massKg, "kg")}</strong></div></div>}
      {tab === "orbit" && <div className="orbit-facts"><span>ORBITAL ELEMENTS</span><div><span>Primary</span><strong>{parent ?? "—"}</strong></div><div><span>Semi-major axis</span><strong>{format(body.orbit?.semiMajorAxisKm, "km")}</strong></div><div><span>Eccentricity</span><strong>{body.orbit?.eccentricity.toFixed(4) ?? "暂无可靠数据"}</strong></div><div><span>Inclination</span><strong>{body.orbit ? `${(body.orbit.inclinationRad * 180 / Math.PI).toFixed(2)}°` : "暂无可靠数据"}</strong></div><div><span>Period (Kepler)</span><strong>{format(orbitPeriodDays, "days")}</strong></div></div>}
      {tab === "physical" && <div className="fact-grid"><div><span>MEAN RADIUS</span><strong>{format(body.radiusKm, "km")}</strong></div><div><span>MASS</span><strong>{format(body.massKg, "kg")}</strong></div><div><span>DENSITY</span><strong>{format(density, "kg/m³")}</strong></div><div><span>ROTATION</span><strong>{format(body.rotationPeriodHours, "h")}</strong></div><div><span>AXIAL TILT</span><strong>{format(body.axialTiltDeg, "°")}</strong></div></div>}
      {tab === "science" && <div className="science-facts"><div><span>POSITION MODEL</span><strong>{positionMode}</strong></div><div><span>FRAME</span><strong>{body.orbit?.elementFrame ?? "Catalog"}</strong></div><div><span>EPOCH</span><strong>{format(body.orbit?.epochJD, "JD TDB")}</strong></div><div><span>DATA REVISION</span><strong>{body.sourceRevision ?? "暂无可靠数据"}</strong></div><div><span>UPDATED</span><strong>{body.sourceUpdatedAt ?? "暂无可靠数据"}</strong></div></div>}
    </div>
    <a className="source-link" href={body.source} target="_blank" rel="noreferrer">OPEN DATA SOURCE <span>↗</span></a>
    <div className="mode-note"><span className="live-indicator" />{positionMode === "Kepler fallback" ? "ESTIMATED POSITION · KEPLER" : "LOCAL POSITION DATA"}</div>
  </aside>;
}
