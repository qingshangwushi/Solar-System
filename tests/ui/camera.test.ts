import { describe, expect, it } from "vitest";
import { overviewCameraDistance } from "../../src/scene/camera";

describe("overview camera framing", () => {
  it("fits the outermost displayed radius inside the vertical field of view", () => {
    const radius = 4_500;
    const fov = 48;
    const distance = overviewCameraDistance(radius, fov);
    expect(distance * Math.sin(fov * Math.PI / 360)).toBeGreaterThanOrEqual(radius);
  });

  it("rejects invalid extents, field of view, and margins", () => {
    expect(() => overviewCameraDistance(-1, 48)).toThrow(/radius/i);
    expect(() => overviewCameraDistance(1, 180)).toThrow(/field of view/i);
    expect(() => overviewCameraDistance(1, 48, 0.9)).toThrow(/margin/i);
  });
});
