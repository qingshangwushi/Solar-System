import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { MinorBodyLayer } from "../../src/scene/MinorBodyLayer";
import { createScale } from "../../src/scene/scale";

describe("instanced minor-body layer", () => {
  it("uses the recorded positions and releases its GPU resources", () => {
    const scene = new Scene();
    const layer = new MinorBodyLayer(scene, createScale("exhibition"));
    layer.setBodies([
      { id: "ceres", name: "Ceres", type: "asteroid", source: "fixture", positionKm: { x: 1_000_000, y: 0, z: 0 } },
      { id: "vesta", name: "Vesta", type: "asteroid", source: "fixture", positionKm: { x: 2_000_000, y: 0, z: 0 } },
    ]);
    expect(layer.mesh.count).toBe(2);
    const matrix = layer.getInstancePosition(1);
    expect(matrix.x).toBeGreaterThan(layer.getInstancePosition(0).x);
    expect(layer.visibleBodyIds).toEqual(["ceres", "vesta"]);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
    expect(layer.mesh.geometry.userData.disposed).toBe(true);
  });
});
