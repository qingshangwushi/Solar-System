import type { CelestialObject } from "../astronomy/types";
import { searchCatalog } from "../astronomy/catalog";

interface Props {
  catalog: CelestialObject[];
  query: string;
  selectedId: string;
  onQuery(query: string): void;
  onSelect(id: string): void;
}

const typeNames: Record<CelestialObject["type"], string> = {
  star: "Star · 恒星", planet: "Planet · 行星", dwarfPlanet: "Dwarf planet · 矮行星", moon: "Moon · 卫星",
  asteroid: "Minor planet · 小行星", comet: "Comet · 彗星", centaur: "Centaur · 半人马小行星", tno: "Trans-Neptunian · 海王星外天体", spacecraft: "Spacecraft · 探测器",
};
const planetOrder = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
const parentOrder = ["earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
const parentLabels: Record<string, string> = { earth: "Earth system", mars: "Mars system", jupiter: "Jupiter system", saturn: "Saturn system", uranus: "Uranus system", neptune: "Neptune system" };

export function CelestialSidebar({ catalog, query, selectedId, onQuery, onSelect }: Props) {
  const results = query ? searchCatalog(catalog, query) : [];
  const grouped = (items: CelestialObject[], title: string, key: string, open = false) => <details className="catalog-group" key={key} open={open}>
    <summary><span>{title}</span><small>{items.length}</small></summary>
    <div className="catalog-group-items">{items.map(renderBody)}</div>
  </details>;
  const renderBody = (body: CelestialObject) => <button className={`body-row ${selectedId === body.id ? "is-selected" : ""}`} key={body.id} type="button" aria-current={selectedId === body.id ? "true" : undefined} onClick={() => onSelect(body.id)}>
    <span className={`body-dot type-${body.type}`} aria-hidden="true" />
    <span className="body-row-copy"><strong>{body.name}</strong><small>{body.officialName && body.officialName !== body.name ? body.officialName : typeNames[body.type]}</small></span>
    <span className="body-row-arrow" aria-hidden="true">↗</span>
  </button>;
  const sun = catalog.filter((body) => body.id === "sun");
  const planets = catalog.filter((body) => body.type === "planet").sort((a, b) => planetOrder.indexOf(a.id) - planetOrder.indexOf(b.id));
  const dwarfPlanets = catalog.filter((body) => body.type === "dwarfPlanet");
  const moons = catalog.filter((body) => body.type === "moon");
  const minor = catalog.filter((body) => body.type === "asteroid");
  const comets = catalog.filter((body) => body.type === "comet");
  const distant = catalog.filter((body) => body.type === "tno" || body.type === "centaur");
  const spacecraft = catalog.filter((body) => body.type === "spacecraft");
  return <aside className="sidebar panel" aria-label="Celestial catalog">
    <div className="panel-heading"><div><span className="section-kicker">CATALOG / 天体目录</span><h2>Solar system</h2></div><span className="count-pill">{catalog.length}</span></div>
    <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search celestial bodies" placeholder="Search name or alias…" value={query} onChange={(event) => onQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
    <div className="catalog-hint">Select a world to inspect its orbit and data source.</div>
    <nav className="body-list" aria-label="Bodies">
      {query ? <>{results.map(renderBody)}{results.length === 0 && <p className="empty-results">No matching objects. Try an alias.</p>}</> : <>
        {sun.map(renderBody)}
        {grouped(planets, "Planets · 行星", "planets", true)}
        {grouped(dwarfPlanets, "Dwarf planets · 矮行星", "dwarfs")}
        {parentOrder.map((parentId) => grouped(moons.filter((body) => body.parentId === parentId), `${parentLabels[parentId]} · 卫星系统`, parentId))}
        {grouped(moons.filter((body) => !parentOrder.includes(body.parentId ?? "")), "Other natural satellites", "other-moons")}
        {grouped(minor.filter((body) => body.population === "mainBelt"), "Main belt · 主小行星带", "main-belt")}
        {grouped(minor.filter((body) => body.population === "nearEarth" || body.population === "trojan" || body.population === "centaur" || body.population === "kuiperBelt" || body.population === "scatteredDisk" || body.population === "tno"), "Other minor planets", "other-minor")}
        {grouped(minor.filter((body) => !body.population), "Unclassified minor planets", "unclassified")}
        {grouped(comets, "Comets · 彗星", "comets")}
        {grouped(distant, "TNO / Centaurs", "distant")}
        {grouped(spacecraft, "Spacecraft · 探测器", "spacecraft")}
      </>}
    </nav>
    <div className="catalog-footer"><span className="live-indicator" />LOCAL DATA · OFFLINE READY</div>
  </aside>;
}
