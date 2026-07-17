import type { JulianDate, TimeScale } from '@solar-system/schemas';

const JD_MJD_OFFSET = 2400000.5;
const SECONDS_PER_DAY = 86400;
const TAI_TT_OFFSET = 32.184;

const LEAP_SECONDS: Array<{ mjd: number; offset: number }> = [
  { mjd: 41317.0, offset: 10 },
  { mjd: 41499.0, offset: 11 },
  { mjd: 41683.0, offset: 12 },
  { mjd: 42048.0, offset: 13 },
  { mjd: 42413.0, offset: 14 },
  { mjd: 42778.0, offset: 15 },
  { mjd: 43144.0, offset: 16 },
  { mjd: 43509.0, offset: 17 },
  { mjd: 43874.0, offset: 18 },
  { mjd: 44239.0, offset: 19 },
  { mjd: 44786.0, offset: 20 },
  { mjd: 45151.0, offset: 21 },
  { mjd: 45516.0, offset: 22 },
  { mjd: 46247.0, offset: 23 },
  { mjd: 47161.0, offset: 24 },
  { mjd: 47892.0, offset: 25 },
  { mjd: 48257.0, offset: 26 },
  { mjd: 48804.0, offset: 27 },
  { mjd: 49169.0, offset: 28 },
  { mjd: 49534.0, offset: 29 },
  { mjd: 50083.0, offset: 30 },
  { mjd: 50630.0, offset: 31 },
  { mjd: 51179.0, offset: 32 },
  { mjd: 53736.0, offset: 33 },
  { mjd: 54832.0, offset: 34 },
  { mjd: 56109.0, offset: 35 },
  { mjd: 57204.0, offset: 36 },
  { mjd: 57754.0, offset: 37 },
];

export function getTaiOffsetUtc(mjdUtc: number): number {
  if (mjdUtc < 41317.0) {
    return 9;
  }
  let offset = 0;
  for (const entry of LEAP_SECONDS) {
    if (mjdUtc >= entry.mjd) {
      offset = entry.offset;
    } else {
      break;
    }
  }
  return offset;
}

export function getTaiOffsetTai(mjdTai: number): number {
  let offset = 0;
  for (const entry of LEAP_SECONDS) {
    if (mjdTai >= entry.mjd + offset / SECONDS_PER_DAY) {
      offset = entry.offset;
    } else {
      break;
    }
  }
  return offset;
}

export function utcToTai(mjdUtc: number): number {
  const offset = getTaiOffsetUtc(mjdUtc);
  return mjdUtc + offset / SECONDS_PER_DAY;
}

export function taiToUtc(mjdTai: number): number {
  const offset = getTaiOffsetTai(mjdTai);
  return mjdTai - offset / SECONDS_PER_DAY;
}

export function taiToTt(mjdTai: number): number {
  return mjdTai + TAI_TT_OFFSET / SECONDS_PER_DAY;
}

export function ttToTai(mjdTt: number): number {
  return mjdTt - TAI_TT_OFFSET / SECONDS_PER_DAY;
}

export function utcToTt(mjdUtc: number): number {
  return taiToTt(utcToTai(mjdUtc));
}

export function ttToUtc(mjdTt: number): number {
  return taiToUtc(ttToTai(mjdTt));
}

export function computeTdbOffset(mjdTt: number): number {
  const jdTt = mjdTt + JD_MJD_OFFSET;
  const t = (jdTt - 2451545.0) / 36525.0;
  
  const meanAnomaly = 6.24006014 + 628.301955 * t;
  const equationOfCenter = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly)
    + 0.000289 * Math.sin(3 * meanAnomaly);
  
  let deltaTdb = (1.658 / 86400.0) * Math.sin(meanAnomaly + equationOfCenter);
  
  const b = 0.001657 * Math.sin(628.3076 * t + 6.2401)
    + 0.000022 * Math.sin(1256.6152 * t + 4.2970)
    + 0.000014 * Math.sin(575.3385 * t + 0.7844)
    + 0.000005 * Math.sin(359.9910 * t + 4.4026)
    + 0.000005 * Math.sin(182.6250 * t + 2.1240)
    + 0.000003 * Math.sin(52.9691 * t + 1.5846)
    + 0.000003 * Math.sin(21.3299 * t + 5.9463)
    + 0.000002 * Math.sin(15.8500 * t + 2.5431)
    + 0.000002 * Math.sin(10.9620 * t + 6.1300)
    + 0.000002 * Math.sin(7.4780 * t + 4.2662);
  
  deltaTdb += b / 86400.0;
  
  return deltaTdb;
}

export function ttToTdb(mjdTt: number): number {
  return mjdTt + computeTdbOffset(mjdTt);
}

export function tdbToTt(mjdTdb: number): number {
  let mjdTt = mjdTdb;
  for (let i = 0; i < 5; i++) {
    mjdTt = mjdTdb - computeTdbOffset(mjdTt);
  }
  return mjdTt;
}

export function utcToTdb(mjdUtc: number): number {
  return ttToTdb(utcToTt(mjdUtc));
}

export function tdbToUtc(mjdTdb: number): number {
  return ttToUtc(tdbToTt(mjdTdb));
}

export function convertTime(mjd: number, fromScale: TimeScale, toScale: TimeScale): number {
  if (fromScale === toScale) return mjd;
  
  let mjdTai: number;
  let mjdTt: number;
  
  switch (fromScale) {
    case 'Utc':
      mjdTai = utcToTai(mjd);
      mjdTt = taiToTt(mjdTai);
      break;
    case 'Tai':
      mjdTai = mjd;
      mjdTt = taiToTt(mjdTai);
      break;
    case 'Tt':
      mjdTt = mjd;
      mjdTai = ttToTai(mjdTt);
      break;
    case 'Tdb':
      mjdTt = tdbToTt(mjd);
      mjdTai = ttToTai(mjdTt);
      break;
    default:
      throw new Error(`Unsupported time scale: ${fromScale}`);
  }
  
  switch (toScale) {
    case 'Utc':
      return taiToUtc(mjdTai);
    case 'Tai':
      return mjdTai;
    case 'Tt':
      return mjdTt;
    case 'Tdb':
      return ttToTdb(mjdTt);
    default:
      throw new Error(`Unsupported time scale: ${toScale}`);
  }
}

export function nowAsJulianDate(): JulianDate {
  const now = new Date();
  const mjdUtc = dateToMjd(now);
  const isPredicted = mjdUtc > 59960.0;
  const isPredictedDeltaT = mjdUtc > 59960.0;
  
  return {
    mjd: mjdUtc,
    scale: 'Utc',
    uncertainty: {
      predicted: isPredicted,
      predicted_delta_t: isPredictedDeltaT,
    },
  };
}

export function dateToMjd(date: Date): number {
  // Date.getTime() 已经是 UTC 毫秒数；直接换算到 JD/MJD 即可，
  // 不要再叠加 getTimezoneOffset()（会导致本地时区被当作 UTC 二次解释）。
  const jd = (date.getTime() / 86400000) + 2440587.5;
  return jd - JD_MJD_OFFSET;
}

export function mjdToDate(mjd: number): Date {
  const jd = mjd + JD_MJD_OFFSET;
  const timestamp = (jd - 2440587.5) * 86400000;
  return new Date(timestamp);
}

export function formatMjd(mjd: number): string {
  const date = mjdToDate(mjd);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
}

export function parseMjd(str: string): number {
  const date = new Date(str);
  return dateToMjd(date);
}

export function createJulianDate(mjd: number, scale: TimeScale): JulianDate {
  const isPredicted = scale === 'Utc' && mjd > 59960.0;
  const isPredictedDeltaT = scale === 'Utc' && mjd > 59960.0;
  
  return {
    mjd,
    scale,
    uncertainty: {
      predicted: isPredicted,
      predicted_delta_t: isPredictedDeltaT,
    },
  };
}

export function addDays(jd: JulianDate, days: number): JulianDate {
  return {
    ...jd,
    mjd: jd.mjd + days,
  };
}

export function addSeconds(jd: JulianDate, seconds: number): JulianDate {
  return {
    ...jd,
    mjd: jd.mjd + seconds / SECONDS_PER_DAY,
  };
}

export function diffDays(a: JulianDate, b: JulianDate): number {
  const aTdb = convertTime(a.mjd, a.scale, 'Tdb');
  const bTdb = convertTime(b.mjd, b.scale, 'Tdb');
  return bTdb - aTdb;
}
