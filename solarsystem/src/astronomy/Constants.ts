/**
 * Astronomical constants.
 *
 * Sources
 *  - IAU 2015 Resolution B3 nominal solar values (GM_sun, R_sun)
 *  - IAU 1976/2009 obliquity of the ecliptic at J2000
 *  - NASA/JPL Solar System Dynamics (planetary GM values, planet poles)
 *
 * GM values of the planetary systems are read from the generated catalog
 * (data/sources/planet-physical.json -> public/data/catalog/catalog.json) rather
 * than hard-coded here, so a data refresh propagates automatically.
 */

/** Nominal solar mass parameter, km^3/s^2 (IAU 2015 Resolution B3). */
export const GM_SUN_KM3_S2 = 1.32712440018e11

/** Nominal solar radius, km (IAU 2015 Resolution B3). */
export const SOLAR_RADIUS_KM = 695_700

/** Obliquity of the ecliptic at J2000.0, radians (IAU 2006 value 23°26'21.406"). */
export const OBLIQUITY_J2000_RAD = 23.4392911111 * (Math.PI / 180)

/** J2000.0 epoch as a Julian Date (TT). */
export const J2000_JD = 2451545.0

/** J2000.0 as a Modified Julian Date. */
export const J2000_MJD = 51544.5

/** Days in a Julian century. */
export const JULIAN_CENTURY_DAYS = 36525

/** Speed of light, km/s (IAU 2009). */
export const SPEED_OF_LIGHT_KM_S = 299_792.458

/** Moon-to-Earth mass ratio, used to split the Earth/Moon barycenter (DE430 value). */
export const MOON_EARTH_MASS_RATIO = 0.0123000371

/** Julian Date of the Unix epoch (1970-01-01T00:00:00Z). */
export const JD_UNIX_EPOCH = 2440587.5

/** Reference epoch of the JPL planetary satellite mean elements (2000-01-01.5 TDB). */
export const SATELLITE_MEAN_ELEMENT_EPOCH_JD = 2451545.0