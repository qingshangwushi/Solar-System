import utcTaiData from "../data/time/leap-seconds.json";
import { julianDateToUtc, parseUtcTimestamp, utcToJulianDate } from "./time";

interface HistoricalOffsetSegment {
  startUtc: string;
  endUtc: string;
  baseSeconds: number;
  referenceMjd: number;
  driftSecondsPerDay: number;
}

interface LeapSecondRecord {
  effectiveUtc: string;
  taiMinusUtcSeconds: number;
}

interface UtcTaiData {
  historicalSegments: HistoricalOffsetSegment[];
  leapSeconds: LeapSecondRecord[];
}

const DATA = utcTaiData as UtcTaiData;
const MJD_OFFSET = 2_400_000.5;
const SECONDS_PER_DAY = 86_400;
const DEG_TO_RAD = Math.PI / 180;

export function taiMinusUtcSeconds(utc: string): number {
  const timestamp = parseUtcTimestamp(utc);
  const mjd = utcToJulianDate(utc) - MJD_OFFSET;

  if (timestamp < Date.parse("1972-01-01T00:00:00Z")) {
    const segment = [...DATA.historicalSegments]
      .reverse()
      .find((item) => timestamp >= Date.parse(`${item.startUtc}T00:00:00Z`));
    if (!segment) {
      throw new RangeError("UTC-to-TAI conversion is only supported from 1961 onward");
    }
    return segment.baseSeconds + (mjd - segment.referenceMjd) * segment.driftSecondsPerDay;
  }

  const record = [...DATA.leapSeconds]
    .reverse()
    .find((item) => timestamp >= Date.parse(`${item.effectiveUtc}T00:00:00Z`));
  if (!record) {
    throw new RangeError("UTC-to-TAI conversion has no offset record for this date");
  }
  return record.taiMinusUtcSeconds;
}

function tdbMinusTtSeconds(jdTt: number): number {
  const meanAnomaly = (357.53 + 0.9856003 * (jdTt - 2_451_545)) * DEG_TO_RAD;
  return 0.001657 * Math.sin(meanAnomaly) + 0.000022 * Math.sin(2 * meanAnomaly);
}

export function utcToTdbJulianDate(utc: string): number {
  const jdUtc = utcToJulianDate(utc);
  const taiMinusUtc = taiMinusUtcSeconds(utc);
  const jdTt = jdUtc + (taiMinusUtc + 32.184) / SECONDS_PER_DAY;
  return jdTt + tdbMinusTtSeconds(jdTt) / SECONDS_PER_DAY;
}

export function tdbJulianDateToUtc(jdTdb: number): string {
  if (!Number.isFinite(jdTdb)) {
    throw new RangeError("TDB Julian Date must be finite");
  }

  let jdUtc = jdTdb - (69.184 / SECONDS_PER_DAY);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const utc = julianDateToUtc(jdUtc);
    const taiMinusUtc = taiMinusUtcSeconds(utc);
    const jdTt = jdUtc + (taiMinusUtc + 32.184) / SECONDS_PER_DAY;
    jdUtc = jdTdb - (taiMinusUtc + 32.184 + tdbMinusTtSeconds(jdTt)) / SECONDS_PER_DAY;
  }
  return julianDateToUtc(jdUtc);
}
