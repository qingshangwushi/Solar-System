import type { SimulationTime } from "../astronomy/types";
import type { CameraMode } from "../scene/SolarSystemScene";
import type { ScaleMode } from "../scene/scale";
import type { SceneLayer } from "../scene/SolarSystemScene";
import type { QualityPreset } from "../scene/quality";

export interface AppState {
  selectedBodyId: string;
  cameraMode: CameraMode;
  scaleMode: ScaleMode;
  qualityPreset: QualityPreset;
  layers: Record<SceneLayer, boolean>;
  time: SimulationTime;
}

export type AppAction =
  | { type: "SELECT_BODY"; id: string }
  | { type: "CAMERA_MODE"; mode: CameraMode }
  | { type: "SCALE_MODE"; mode: ScaleMode }
  | { type: "QUALITY"; preset: QualityPreset }
  | { type: "TOGGLE_LAYER"; layer: SceneLayer; enabled: boolean }
  | { type: "TIME"; time: SimulationTime };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SELECT_BODY": return { ...state, selectedBodyId: action.id, cameraMode: "follow" };
    case "CAMERA_MODE": return { ...state, cameraMode: action.mode };
    case "SCALE_MODE": return { ...state, scaleMode: action.mode };
    case "QUALITY": return { ...state, qualityPreset: action.preset };
    case "TOGGLE_LAYER": return { ...state, layers: { ...state.layers, [action.layer]: action.enabled } };
    case "TIME": return { ...state, time: action.time };
  }
}
