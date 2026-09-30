import { describe, expect, it } from "vitest";
import { TourController } from "../../src/tours/TourController";
import tours from "../../src/tours/tours.json";
import stars from "../../src/data/stars/manifest.json";

describe("optional guided content", () => {
  it("advances and stops tours deterministically at known body IDs", () => {
    const controller = new TourController(tours, new Set(["sun", "earth", "moon", "saturn", "titan", "neptune", "pluto", "makemake", "sedna"]));
    expect(controller.start("inner-worlds")?.bodyId).toBe("sun");
    expect(controller.next()?.bodyId).toBe("earth");
    expect(controller.next()?.bodyId).toBe("moon");
    expect(controller.next()).toBeUndefined();
    expect(controller.isPlaying).toBe(false);
    expect(controller.start("saturn-system")?.bodyId).toBe("saturn");
    controller.stop();
    expect(controller.current).toBeUndefined();
  });

  it("keeps background stars in a separate, sourced catalog", () => {
    expect(stars.category).toBe("backgroundStar");
    expect(stars.stars.length).toBeGreaterThan(0);
    expect(stars.stars.every((star) => star.source.startsWith("https://") && !("type" in star))).toBe(true);
  });
});
