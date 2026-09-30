import { describe, expect, it } from "vitest";
import { createScale } from "../../src/scene/scale";

describe("display scale modes", () => {
  it("preserves scientific distances and radii with one uniform scale", () => {
    const scale = createScale("scientific");
    expect(scale.distanceKm(2_000_000) / scale.distanceKm(1_000_000)).toBe(2);
    expect(scale.radiusKm(2_000) / scale.radiusKm(1_000)).toBe(2);
    expect(scale.enhancementActive).toBe(false);
    expect(scale.nonLinearDistance).toBe(false);
  });

  it("enhances body radii only in visible scale and reports it", () => {
    const scale = createScale("visible");
    expect(scale.distanceKm(100_000_000)).toBe(createScale("scientific").distanceKm(100_000_000));
    expect(scale.radiusKm(1000)).toBeGreaterThan(createScale("scientific").radiusKm(1000));
    expect(scale.enhancementActive).toBe(true);
    expect(scale.nonLinearDistance).toBe(false);
  });

  it("compresses exhibition distances monotonically and declares the nonlinear mapping", () => {
    const scale = createScale("exhibition");
    expect(scale.distanceKm(20_000_000)).toBeGreaterThan(scale.distanceKm(10_000_000));
    expect(scale.distanceKm(10_000_000)).toBeGreaterThan(scale.distanceKm(1_000_000));
    expect(scale.nonLinearDistance).toBe(true);
    expect(scale.label).toMatch(/non-linear|非线性/i);
  });
});
