import type { CameraMode, SceneLayer } from "../scene/SolarSystemScene";
import type { ScaleMode } from "../scene/scale";
import type { TourDefinition } from "../tours/TourController";
import type { QualityPreset } from "../scene/quality";

interface Props {
  scaleMode: ScaleMode; qualityPreset: QualityPreset; cameraMode: CameraMode; layers: Record<SceneLayer, boolean>; scaleLabel: string;
  tours: TourDefinition[]; selectedTourId: string; tourPlaying: boolean;
  onScale(mode: ScaleMode): void; onQuality(preset: QualityPreset): void; onCamera(mode: CameraMode): void; onLayer(layer: SceneLayer, enabled: boolean): void;
  onTourChange(id: string): void; onTourStart(): void; onTourNext(): void;
}

export function SceneToolbar({ scaleMode, qualityPreset, cameraMode, layers, scaleLabel, tours, selectedTourId, tourPlaying, onScale, onQuality, onCamera, onLayer, onTourChange, onTourStart, onTourNext }: Props) {
  return <div className="scene-toolbar panel">
    <label>Scale mode <select aria-label="Scale mode" value={scaleMode} onChange={(event) => onScale(event.target.value as ScaleMode)}><option value="scientific">Scientific</option><option value="visible">Visible</option><option value="exhibition">Exhibition</option></select></label>
    <label>Quality <select aria-label="Quality preset" value={qualityPreset} onChange={(event) => onQuality(event.target.value as QualityPreset)}><option value="ultra">Ultra</option><option value="high">High</option><option value="medium">Medium</option><option value="performance">Performance</option></select></label>
    <label>Camera <select aria-label="Camera mode" value={cameraMode} onChange={(event) => onCamera(event.target.value as CameraMode)}><option value="overview">Overview</option><option value="orbit">Orbit</option><option value="follow">Follow</option><option value="near">Near object</option><option value="free">Free flight</option></select></label>
    <div className="layer-toggles" aria-label="Scene layers">
      <label><input type="checkbox" checked={layers.bodies} onChange={(event) => onLayer("bodies", event.target.checked)} /> Bodies</label>
      <label><input type="checkbox" checked={layers.orbits} onChange={(event) => onLayer("orbits", event.target.checked)} /> Orbits</label>
      <label><input type="checkbox" checked={layers.labels} onChange={(event) => onLayer("labels", event.target.checked)} /> Labels</label>
      <label><input type="checkbox" checked={layers.asteroids} onChange={(event) => onLayer("asteroids", event.target.checked)} /> Asteroids</label>
      <label><input type="checkbox" checked={layers.comets} onChange={(event) => onLayer("comets", event.target.checked)} /> Comets</label>
      <label><input type="checkbox" checked={layers.tno} onChange={(event) => onLayer("tno", event.target.checked)} /> TNO</label>
      <label><input type="checkbox" checked={layers.stars} onChange={(event) => onLayer("stars", event.target.checked)} /> Background stars</label>
    </div>
    <label className="tour-select">Tour<select aria-label="Guided tour" value={selectedTourId} onChange={(event) => onTourChange(event.target.value)}>{tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}</select></label>
    <button type="button" className="tour-button" onClick={tourPlaying ? onTourNext : onTourStart}>{tourPlaying ? "Next step →" : "Start tour"}</button>
    <span className="scale-status" aria-live="polite">{scaleLabel}</span>
  </div>;
}
