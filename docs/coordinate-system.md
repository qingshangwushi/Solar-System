# Coordinate System

## Astronomical frame

The internal orbital frame is heliocentric ECLIPJ2000: origin at the Sun, X toward the J2000 vernal equinox, Y in the J2000 ecliptic plane, and Z toward the north ecliptic pole. Every imported ephemeris dataset records its actual frame and time scale; the ingestion step transforms data into the internal frame before publishing it.

NAIF distinguishes J2000/ICRF from ECLIPJ2000 as named inertial frames and exposes explicit transformations between them ([NAIF Reference Frames](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/MATLAB/req/frames.html)). The MVP conversion rotates an ICRF/J2000 vector by the J2000 mean obliquity, 23.439291111° about the X axis. This fixed transformation is only used for the inertial frames declared in the data schema.

## Scene mapping

Astronomy vectors are plain Float64-compatible `{ x, y, z }` values in km. Scene coordinates use Three.js Y-up with the ecliptic plane mapped to XZ:

```text
scene = (x_ecliptic, z_ecliptic, -y_ecliptic)
ecliptic = (x_scene, -z_scene, y_scene)
```

This is a proper rotation, preserves distances, and keeps the handedness of the coordinate frame. Tests cover basis vectors and round-trip conversion.

## Precision and rendering

The astronomy layer retains Float64 values in km. The renderer subtracts the camera's astronomical position on the CPU, applies the selected visible/exhibition scale, and sends local camera-relative Float32 coordinates to the GPU. The viewer must keep its selected scale mode visible because Visible Scale changes body radii and Exhibition Scale changes distances.
