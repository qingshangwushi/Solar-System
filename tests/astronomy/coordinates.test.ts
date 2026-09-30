import { describe, expect, it } from "vitest";
import { eclipticToScene, icrfToEclipticJ2000, sceneToEcliptic } from "../../src/astronomy/coordinates";

describe("astronomical and scene coordinates", () => {
  it("maps the ecliptic plane to the Three.js XZ plane with Y up", () => {
    const mapped = eclipticToScene({ x: 1, y: 2, z: 3 });
    expect([mapped.x, mapped.y, mapped.z]).toEqual([1, 3, -2]);
    const xAxis = eclipticToScene({ x: 1, y: 0, z: 0 });
    expect(xAxis.x).toBeCloseTo(1, 10);
    expect(xAxis.y).toBeCloseTo(0, 10);
    expect(xAxis.z).toBeCloseTo(0, 10);
    const yAxis = eclipticToScene({ x: 0, y: 1, z: 0 });
    expect(yAxis.x).toBeCloseTo(0, 10);
    expect(yAxis.y).toBeCloseTo(0, 10);
    expect(yAxis.z).toBeCloseTo(-1, 10);
  });

  it("round-trips coordinates without changing values", () => {
    const position = { x: 120_000, y: -45_000, z: 700 };
    expect(sceneToEcliptic(eclipticToScene(position))).toEqual(position);
  });

  it("converts the ICRF equatorial pole to the J2000 ecliptic frame", () => {
    const converted = icrfToEclipticJ2000({ x: 0, y: 0, z: 1 });
    expect(converted.x).toBe(0);
    expect(converted.y).toBeCloseTo(Math.sin((23.439291111 * Math.PI) / 180), 10);
    expect(converted.z).toBeCloseTo(Math.cos((23.439291111 * Math.PI) / 180), 10);
  });
});
