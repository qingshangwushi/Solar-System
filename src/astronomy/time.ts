import type { SimulationTime } from "./types";
import { tdbJulianDateToUtc, utcToTdbJulianDate } from "./time-scales";

const UNIX_EPOCH_JD = 2_440_587.5;
const MS_PER_DAY = 86_400_000;

export function parseUtcTimestamp(utc: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(utc);
  if (!match) {
    throw new RangeError("UTC must use YYYY-MM-DD or an ISO-8601 UTC timestamp ending in Z");
  }

  const [, yearText, monthText, dayText, hourText = "0", minuteText = "0", secondText = "0", millisecondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, "0"));

  if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Invalid UTC date: ${utc}`);
  }

  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid UTC calendar date: ${utc}`);
  }
  return timestamp;
}

export function utcToJulianDate(utc: string): number {
  return parseUtcTimestamp(utc) / MS_PER_DAY + UNIX_EPOCH_JD;
}

export function julianDateToUtc(jd: number): string {
  if (!Number.isFinite(jd)) {
    throw new RangeError("Julian Date must be a finite number");
  }
  const timestamp = (jd - UNIX_EPOCH_JD) * MS_PER_DAY;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Julian Date is outside the supported UTC range");
  }
  return date.toISOString();
}

export function advanceSimulationTime(time: SimulationTime, elapsedSeconds: number): SimulationTime {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed seconds must be a finite non-negative number");
  }
  if (!Number.isFinite(time.speed) || !Number.isFinite(time.julianDateTdb)) {
    throw new RangeError("Simulation time and speed must be finite");
  }
  if (time.paused || elapsedSeconds === 0) return time;

  const jdTdb = time.julianDateTdb + (time.speed * elapsedSeconds) / 86_400;
  return {
    ...time,
    utc: tdbJulianDateToUtc(jdTdb),
    julianDateTdb: jdTdb,
  };
}
