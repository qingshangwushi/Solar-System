import { describe, expect, it } from "vitest";
import { qualityProfile } from "../../src/scene/quality";

describe("exhibition quality profiles", () => {
  it("reduces pixel ratio and orbit geometry through the performance profile", () => {
    expect(qualityProfile("ultra").pixelRatio).toBeGreaterThan(qualityProfile("high").pixelRatio);
    expect(qualityProfile("high").orbitSegments).toBeGreaterThan(qualityProfile("medium").orbitSegments);
    expect(qualityProfile("medium").pixelRatio).toBeGreaterThan(qualityProfile("performance").pixelRatio);
    expect(qualityProfile("performance").orbitSegments).toBe(40);
  });
});
