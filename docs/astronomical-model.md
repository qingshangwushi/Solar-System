# Astronomical Model

## Two-body Kepler propagation

The catalog stores osculating Keplerian elements at an epoch. The propagator treats the target and its primary as an isolated two-body system. It is a catalog-position approximation; it does not model perturbations or replace JPL ephemerides. JPL describes osculating elements as an orbit tangent to the object's actual orbit at the given epoch, and recommends Keplerian elements for suitable applications rather than high-fidelity propagation ([JPL small-body elements](https://ssd.jpl.nasa.gov/sb/elem_tables.html), [JPL planetary orbits](https://ssd.jpl.nasa.gov/planets/orbits.html)).

Inputs use km, seconds, radians, TDB Julian Date, and the primary body's gravitational parameter `μ` in km³/s². Mean motion is:

```text
n = sqrt(μ / |a|³)
M(t) = M₀ + n · (JDₜdb - epochJD) · 86400
```

For elliptic orbits (`0 ≤ e < 1`, `a > 0`), solve `E - e sin(E) = M`, then compute orbital-plane coordinates:

```text
x = a · (cos(E) - e)
y = a · sqrt(1 - e²) · sin(E)
```

For hyperbolic orbits (`e > 1`, `a < 0`), solve `e sinh(H) - H = M`:

```text
x = a · (cosh(H) - e)
y = -a · sqrt(e² - 1) · sinh(H)
```

The solver bounds iterations and rejects invalid conic inputs. Exactly parabolic elements (`e = 1`) are not yet propagated; comet data uses its native perihelion-distance/time-of-perihelion form and is added in the later catalog phase.

The orbital-plane vector is rotated by argument of periapsis `ω`, inclination `i`, and ascending-node longitude `Ω`:

```text
R = Rz(Ω) · Rx(i) · Rz(ω)
```

The implementation accepts `μ` explicitly instead of inferring the primary. The worker resolves parent mass from the catalog and derives `μ` using the documented gravitational constant conversion.

## Data modes and accuracy

- JPL Horizons/SPICE samples provide the MVP's authoritative position track within each dataset's advertised time coverage.
- Kepler propagation is separately labelled when used for the curated asteroid records or an explicitly requested fallback.
- Ephemeris samples are linearly interpolated. The bundled daily tracks have not been compared with independent midpoint Horizons samples, so the manifest's 2,000,000 km threshold is an operator-selected acceptance value, not a verified interpolation-error bound.
- Rotation period and axial tilt affect visual orientation only; they do not change orbital position.

## References

- [NASA: Orbits and Kepler's Laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/)
- [JPL: Small-body element tables](https://ssd.jpl.nasa.gov/sb/elem_tables.html)
- [JPL: Planetary orbits and ephemerides](https://ssd.jpl.nasa.gov/planets/orbits.html)
- [JPL: Planetary satellites and ephemerides](https://ssd.jpl.nasa.gov/sats/orbits.html)
