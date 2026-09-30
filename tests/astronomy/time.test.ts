import { describe, expect, it } from "vitest";
import {
  advanceSimulationTime,
  julianDateToUtc,
  utcToJulianDate,
} from "../../src/astronomy/time";
import { tdbJulianDateToUtc, utcToTdbJulianDate } from "../../src/astronomy/time-scales";

describe("UTC and Julian Date clock", () => {
  it("maps the J2000 noon epoch to JD 2451545", () => {
    expect(utcToJulianDate("2000-01-01T12:00:00Z")).toBeCloseTo(2451545, 9);
  });

  it("round-trips current UTC within one second", () => {
    const utc = "2026-09-30T00:00:00Z";
    expect(Date.parse(julianDateToUtc(utcToJulianDate(utc)))).toBe(Date.parse(utc));
  });

  it("accepts a date-only input as midnight UTC", () => {
    expect(utcToJulianDate("1969-07-20")).toBeCloseTo(2440422.5, 8);
  });

  it("keeps a paused clock still and advances forward or backward by speed", () => {
    const initialUtc = "2000-01-01T12:00:00.000Z";
    const initial = {
      utc: initialUtc,
      julianDateTdb: utcToTdbJulianDate(initialUtc),
      speed: 86400,
      paused: true,
    };
    expect(advanceSimulationTime(initial, 10).julianDateTdb).toBe(initial.julianDateTdb);
    expect(advanceSimulationTime({ ...initial, paused: false }, 1).julianDateTdb).toBeCloseTo(initial.julianDateTdb + 1, 9);
    expect(advanceSimulationTime({ ...initial, speed: -86400, paused: false }, 1).julianDateTdb).toBeCloseTo(initial.julianDateTdb - 1, 9);
  });

  it("rejects invalid UTC input", () => {
    expect(() => utcToJulianDate("2026-02-31T12:00:00Z")).toThrow(RangeError);
  });

  it("converts UTC to TDB within one second from 1969 through the current offset table", () => {
    const historic = utcToTdbJulianDate("1969-07-20T20:17:40Z");
    const historicOffsetSeconds = (historic - utcToJulianDate("1969-07-20T20:17:40Z")) * 86400;
    expect(historicOffsetSeconds).toBeGreaterThan(39);
    expect(historicOffsetSeconds).toBeLessThan(41);

    const current = utcToTdbJulianDate("2026-09-30T00:00:00Z");
    const currentOffsetSeconds = (current - utcToJulianDate("2026-09-30T00:00:00Z")) * 86400;
    expect(currentOffsetSeconds).toBeGreaterThan(69);
    expect(currentOffsetSeconds).toBeLessThan(70);

    const apolloUtc = "1969-07-20T20:17:40Z";
    expect(Math.abs(Date.parse(tdbJulianDateToUtc(utcToTdbJulianDate(apolloUtc))) - Date.parse(apolloUtc))).toBeLessThan(1000);
  });
});
