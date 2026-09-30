import { Vector3 } from "three";
import type { CelestialObject } from "../astronomy/types";
import type { SceneScale } from "./scale";
import { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function overviewCameraDistance(radiusSceneUnits: number, verticalFovDeg: number, margin = 1.12): number {
  if (!Number.isFinite(radiusSceneUnits) || radiusSceneUnits < 0) throw new RangeError("Overview radius must be finite and non-negative");
  if (!Number.isFinite(verticalFovDeg) || verticalFovDeg <= 0 || verticalFovDeg >= 180) throw new RangeError("Vertical field of view must be between 0 and 180 degrees");
  if (!Number.isFinite(margin) || margin < 1) throw new RangeError("Overview margin must be at least 1");
  return Math.max(52, radiusSceneUnits * margin / Math.sin(verticalFovDeg * Math.PI / 360));
}

export function resetOverviewCamera(camera: PerspectiveCamera, controls: OrbitControls, radiusSceneUnits = 20): void {
  const distance = overviewCameraDistance(radiusSceneUnits, camera.fov);
  camera.position.set(distance * 0.45, distance * 0.55, distance * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();
}

export function bodyCameraOffset(body: CelestialObject, scale: SceneScale): Vector3 {
  const distance = Math.max(scale.radiusKm(body.radiusKm ?? 500, body.type) * 35, 1.2);
  return new Vector3(distance * 0.65, distance * 0.45, distance * 1.8);
}
