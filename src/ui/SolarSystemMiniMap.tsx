import type { CelestialObject, Vec3Km } from "../astronomy/types";

interface Props { catalog: CelestialObject[]; positions: ReadonlyMap<string, Vec3Km>; selectedId: string; }
const order = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const kmPerAu = 149_597_870.7;

export function SolarSystemMiniMap({ catalog, positions, selectedId }: Props) {
  const bodies = catalog.filter((body) => order.includes(body.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const radius = (body: CelestialObject) => 5 + Math.log1p(Math.abs(body.orbit?.semiMajorAxisKm ?? 0) / kmPerAu) * 9;
  const objects = bodies.map((body) => {
    const position = positions.get(body.id);
    const currentRadius = position ? Math.hypot(position.x, position.y) : 0;
    const angle = position && currentRadius > 0 ? Math.atan2(position.y, position.x) : (body.orbit?.meanAnomalyRad ?? 0);
    const r = Math.min(51, radius(body));
    return { body, x: 62 + Math.cos(angle) * r, y: 62 - Math.sin(angle) * r, r };
  });
  return <div className="mini-map" aria-label="Solar system overview map">
    <span className="section-kicker">SYSTEM MAP · ECLIPTIC</span>
    <svg viewBox="0 0 124 124" role="img" aria-label="Current heliocentric positions of major planets">
      <defs><radialGradient id="miniSun"><stop stopColor="#fff2b8"/><stop offset="1" stopColor="#ff9f42"/></radialGradient></defs>
      <circle cx="62" cy="62" r="53" fill="none" stroke="rgba(133,166,206,.12)" />
      {objects.map(({ body, r }) => <circle key={`orbit-${body.id}`} cx="62" cy="62" r={r} fill="none" stroke={body.id === selectedId ? "rgba(137,206,250,.35)" : "rgba(122,148,183,.14)"} strokeWidth=".6" />)}
      <circle cx="62" cy="62" r="2.8" fill="url(#miniSun)" />
      {objects.map(({ body, x, y }) => <g key={body.id}><circle cx={x} cy={y} r={body.id === selectedId ? 2.5 : 1.65} fill={body.id === selectedId ? "#e9f7ff" : body.type === "dwarfPlanet" ? "#c9b8a6" : "#81caff"} /><title>{body.name}</title></g>)}
    </svg>
    <span className="mini-map-caption">Major orbits · not to scale</span>
  </div>;
}
