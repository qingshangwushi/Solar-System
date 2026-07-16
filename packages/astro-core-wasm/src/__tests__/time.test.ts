import { describe, it, expect } from 'vitest';
import {
  utcToTai,
  taiToUtc,
  taiToTt,
  ttToTai,
  utcToTt,
  ttToUtc,
  ttToTdb,
  tdbToTt,
  utcToTdb,
  tdbToUtc,
  convertTime,
  dateToMjd,
  mjdToDate,
  formatMjd,
  parseMjd,
  nowAsJulianDate,
  createJulianDate,
  addDays,
  addSeconds,
  diffDays,
  getTaiOffsetUtc,
} from '../time.js';

describe('Leap Seconds', () => {
  it('should return correct TAI offset for known dates', () => {
    expect(getTaiOffsetUtc(41316.0)).toBe(9);
    expect(getTaiOffsetUtc(41317.0)).toBe(10);
    expect(getTaiOffsetUtc(47892.0)).toBe(25);
    expect(getTaiOffsetUtc(57754.0)).toBe(37);
  });
});

describe('UTC ↔ TAI', () => {
  it('should convert UTC to TAI correctly', () => {
    const mjdUtc = 57754.0;
    const mjdTai = utcToTai(mjdUtc);
    expect(mjdTai).toBeCloseTo(mjdUtc + 37 / 86400, 10);
  });

  it('should convert TAI to UTC correctly', () => {
    const mjdTai = 57754.0 + 37 / 86400;
    const mjdUtc = taiToUtc(mjdTai);
    expect(mjdUtc).toBeCloseTo(57754.0, 10);
  });

  it('should be round-trip consistent', () => {
    const mjdUtc = 58000.0;
    const mjdTai = utcToTai(mjdUtc);
    const backUtc = taiToUtc(mjdTai);
    expect(backUtc).toBeCloseTo(mjdUtc, 10);
  });
});

describe('TAI ↔ TT', () => {
  it('should convert TAI to TT correctly', () => {
    const mjdTai = 58000.0;
    const mjdTt = taiToTt(mjdTai);
    expect(mjdTt).toBeCloseTo(mjdTai + 32.184 / 86400, 10);
  });

  it('should convert TT to TAI correctly', () => {
    const mjdTt = 58000.0;
    const mjdTai = ttToTai(mjdTt);
    expect(mjdTai).toBeCloseTo(mjdTt - 32.184 / 86400, 10);
  });

  it('should be round-trip consistent', () => {
    const mjdTai = 58000.0;
    const mjdTt = taiToTt(mjdTai);
    const backTai = ttToTai(mjdTt);
    expect(backTai).toBeCloseTo(mjdTai, 10);
  });
});

describe('UTC ↔ TT', () => {
  it('should convert UTC to TT correctly', () => {
    const mjdUtc = 57754.0;
    const mjdTt = utcToTt(mjdUtc);
    const expected = mjdUtc + (37 + 32.184) / 86400;
    expect(mjdTt).toBeCloseTo(expected, 10);
  });

  it('should convert TT to UTC correctly', () => {
    const mjdTt = 57754.0 + (37 + 32.184) / 86400;
    const mjdUtc = ttToUtc(mjdTt);
    expect(mjdUtc).toBeCloseTo(57754.0, 10);
  });
});

describe('TT ↔ TDB', () => {
  it('should compute TDB offset', () => {
    const mjdTt = 58000.0;
    const offset = ttToTdb(mjdTt) - mjdTt;
    expect(Math.abs(offset)).toBeLessThan(0.0001);
  });

  it('should be round-trip consistent', () => {
    const mjdTt = 58000.0;
    const mjdTdb = ttToTdb(mjdTt);
    const backTt = tdbToTt(mjdTdb);
    expect(backTt).toBeCloseTo(mjdTt, 10);
  });
});

describe('UTC ↔ TDB', () => {
  it('should convert UTC to TDB correctly', () => {
    const mjdUtc = 57754.0;
    const mjdTdb = utcToTdb(mjdUtc);
    expect(typeof mjdTdb).toBe('number');
    expect(!isNaN(mjdTdb)).toBe(true);
  });

  it('should convert TDB to UTC correctly', () => {
    const mjdTdb = utcToTdb(57754.0);
    const mjdUtc = tdbToUtc(mjdTdb);
    expect(mjdUtc).toBeCloseTo(57754.0, 5);
  });
});

describe('convertTime', () => {
  it('should convert between all time scales', () => {
    const mjd = 58000.0;
    expect(convertTime(mjd, 'Utc', 'Utc')).toBe(mjd);
    expect(convertTime(mjd, 'Tai', 'Tai')).toBe(mjd);
    expect(convertTime(mjd, 'Tt', 'Tt')).toBe(mjd);
    expect(convertTime(mjd, 'Tdb', 'Tdb')).toBe(mjd);

    const utcToTai = convertTime(mjd, 'Utc', 'Tai');
    const taiToUtc = convertTime(utcToTai, 'Tai', 'Utc');
    expect(taiToUtc).toBeCloseTo(mjd, 10);
  });
});

describe('Date ↔ MJD', () => {
  it('should convert Date to MJD correctly', () => {
    const date = new Date('2020-01-01T00:00:00Z');
    const mjd = dateToMjd(date);
    expect(mjd).toBeCloseTo(58849.0, 6);
  });

  it('should convert MJD to Date correctly', () => {
    const mjd = 58849.0;
    const date = mjdToDate(mjd);
    expect(date.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('should be round-trip consistent', () => {
    const date = new Date('2025-07-16T12:30:45Z');
    const mjd = dateToMjd(date);
    const backDate = mjdToDate(mjd);
    expect(backDate.toISOString()).toBe(date.toISOString());
  });
});

describe('formatMjd', () => {
  it('should format MJD correctly', () => {
    const mjd = 58849.0;
    const str = formatMjd(mjd);
    expect(str).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('parseMjd', () => {
  it('should parse ISO string to MJD correctly', () => {
    const str = '2020-01-01T00:00:00Z';
    const mjd = parseMjd(str);
    expect(mjd).toBeCloseTo(58849.0, 6);
  });
});

describe('JulianDate helpers', () => {
  it('should create JulianDate correctly', () => {
    const jd = createJulianDate(58849.0, 'Utc');
    expect(jd.mjd).toBe(58849.0);
    expect(jd.scale).toBe('Utc');
  });

  it('should add days correctly', () => {
    const jd = createJulianDate(58849.0, 'Utc');
    const jdPlus1 = addDays(jd, 1);
    expect(jdPlus1.mjd).toBe(58850.0);
    expect(jdPlus1.scale).toBe('Utc');
  });

  it('should add seconds correctly', () => {
    const jd = createJulianDate(58849.0, 'Utc');
    const jdPlus86400 = addSeconds(jd, 86400);
    expect(jdPlus86400.mjd).toBe(58850.0);
  });

  it('should compute difference in days', () => {
    const jd1 = createJulianDate(58849.0, 'Utc');
    const jd2 = createJulianDate(58850.0, 'Utc');
    expect(diffDays(jd1, jd2)).toBeCloseTo(1.0, 5);
  });
});

describe('nowAsJulianDate', () => {
  it('should return current time as JulianDate', () => {
    const jd = nowAsJulianDate();
    expect(jd.scale).toBe('Utc');
    expect(typeof jd.mjd).toBe('number');
    expect(!isNaN(jd.mjd)).toBe(true);
    expect(typeof jd.uncertainty.predicted).toBe('boolean');
    expect(typeof jd.uncertainty.predicted_delta_t).toBe('boolean');
  });
});
