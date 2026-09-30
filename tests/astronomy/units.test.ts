import { describe, expect, it } from "vitest";
import { auToKm, kmToAu } from "../../src/astronomy/units";

describe("astronomical distance units", () => {
  it("converts the astronomical unit using the IAU-defined kilometer value", () => {
    expect(auToKm(1)).toBe(149_597_870.7);
    expect(kmToAu(149_597_870.7)).toBe(1);
  });

  it("round-trips distances in AU within numerical tolerance", () => {
    const au = 32.714;
    expect(kmToAu(auToKm(au))).toBeCloseTo(au, 9);
  });

  it("rejects non-finite distances", () => {
    expect(() => auToKm(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => kmToAu(Number.NaN)).toThrow(RangeError);
  });
});
