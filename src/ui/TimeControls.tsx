import type { SimulationTime } from "../astronomy/types";

interface Props { time: SimulationTime; onDate(value: string): void; onClock(value: string): void; onPause(): void; onReverse(): void; onSpeed(speed: number): void; }
export function TimeControls({ time, onDate, onClock, onPause, onReverse, onSpeed }: Props) {
  return <section className="time-rail panel" aria-label="Simulation time controls">
    <div className="time-label"><span className="section-kicker">ASTRONOMY CLOCK</span><strong>{time.paused ? "PAUSED" : "SIMULATION RUNNING"}</strong></div>
    <label className="date-control">UTC DATE<input aria-label="Simulation date" type="date" value={time.utc.slice(0, 10)} onChange={(event) => onDate(event.target.value)} /></label>
    <label className="date-control">UTC TIME<input aria-label="Simulation time UTC" type="time" step="1" value={time.utc.slice(11, 19)} onChange={(event) => onClock(event.target.value)} /></label>
    <div className="transport-controls">
      <button type="button" className="icon-button" aria-label="Reverse time" title="Reverse time" onClick={onReverse}>↶</button>
      <button type="button" className="play-button" onClick={onPause}>{time.paused ? "▶ Play" : "Ⅱ Pause"}</button>
      <label className="speed-control">Speed<select aria-label="Simulation speed" value={String(time.speed)} onChange={(event) => onSpeed(Number(event.target.value))}><option value="1">1 sec / sec</option><option value="60">1 min / sec</option><option value="3600">1 hour / sec</option><option value="86400">1 day / sec</option><option value="864000">10 days / sec</option><option value="2592000">30 days / sec</option><option value="31557600">1 year / sec</option><option value="-60">−1 min / sec</option><option value="-3600">−1 hour / sec</option><option value="-86400">−1 day / sec</option><option value="-864000">−10 days / sec</option></select></label>
    </div>
    <div className="time-stamp"><strong>{time.utc.slice(11, 19) || "12:00:00"}</strong><span>UTC · TDB clock</span></div>
  </section>;
}
