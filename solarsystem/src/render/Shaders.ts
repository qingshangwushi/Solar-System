/**
 * GLSL sources shared by the renderers.
 *
 * The lighting model is deliberately simple and physical in spirit: the Sun is the
 * only light source and is evaluated as a directional term from the body's
 * heliocentric position, which avoids the intensity falloff artefacts a PointLight
 * produces across a scene this large (project requirement: shader-based solar
 * lighting rather than a point light).
 */

/** Sun surface: self-luminous with limb darkening and a slow granulation. */
export const SUN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`

export const SUN_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

// Cheap value noise used for the slow surface convection pattern.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  float granulation = noise(uv * 42.0 + uTime * 0.02) * 0.55 + noise(uv * 11.0 - uTime * 0.01) * 0.45;
  vec3 surface = texture2D(uMap, uv).rgb;
  vec3 emissive = surface * uColor * (0.85 + granulation * 0.45);

  // Limb darkening: the solar disc is brighter at the centre.
  float limb = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
  emissive *= mix(0.72, 1.18, pow(limb, 0.55));

  gl_FragColor = vec4(emissive, 1.0);
}
`

/** Corona / fresnel glow shell drawn around a star or an atmosphere. */
export const GLOW_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDirection;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDirection = normalize(-viewPosition.xyz);
  gl_Position = projectionMatrix * viewPosition;
}
`

export const GLOW_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
varying vec3 vNormal;
varying vec3 vViewDirection;

void main() {
  // Fresnel-style rim term: strongest where the surface is edge-on.
  float facing = abs(dot(normalize(vNormal), normalize(vViewDirection)));
  float rim = pow(1.0 - facing, uPower);
  gl_FragColor = vec4(uColor * rim * uIntensity, rim * uIntensity);
}
`

/** Atmosphere shell with a forward-scattering term towards the Sun. */
export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunDirection;   // world space, from the body towards the Sun
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec3 vWorldNormal;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(vViewDirection);
  float facing = abs(dot(normal, view));
  float rim = pow(1.0 - facing, 2.4);
  // Lit fraction: the atmosphere is only visible on the day side.
  float sun = clamp(dot(normalize(vWorldNormal), normalize(uSunDirection)) * 0.5 + 0.65, 0.0, 1.0);
  float alpha = rim * sun * uIntensity;
  gl_FragColor = vec4(uColor, alpha);
}
`

/**
 * Planet surface: single directional light from the Sun, optional night-lights
 * emission, normal mapping, a specular term over water and a thin terminator
 * softening so the day/night boundary does not alias.
 */
export const PLANET_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`

export const PLANET_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
uniform vec3 uSunDirection;      // world space, from the body towards the Sun
uniform float uHasNightMap;
uniform float uHasNormalMap;
uniform float uHasSpecularMap;
uniform float uSpecularStrength;
uniform float uAmbient;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  if (uHasNormalMap > 0.5) {
    vec3 tangentNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    normal = normalize(normal + tangentNormal * 0.6);
  }

  vec3 sunDirection = normalize(uSunDirection);
  float lambert = dot(normalize(vWorldNormal), sunDirection);
  // Softened terminator keeps the day/night edge smooth at grazing angles.
  float day = smoothstep(-0.12, 0.16, lambert);

  vec3 albedo = texture2D(uMap, vUv).rgb;
  vec3 color = albedo * (uAmbient + 1.25 * clamp(lambert, 0.0, 1.0));

  if (uHasNightMap > 0.5) {
    vec3 night = texture2D(uNightMap, vUv).rgb;
    color += night * (1.0 - day) * 1.35;
  }

  if (uHasSpecularMap > 0.5) {
    float mask = texture2D(uSpecularMap, vUv).r;
    vec3 view = normalize(vViewPosition);
    vec3 halfVector = normalize(sunDirection + view);
    float specular = pow(max(dot(normal, halfVector), 0.0), 48.0);
    color += vec3(specular) * mask * uSpecularStrength * day;
  }

  gl_FragColor = vec4(color, 1.0);
}
`

/**
 * Minor bodies are drawn as a single point cloud. Size comes from the H magnitude
 * (brightness) and the colour from the dynamical class, so the cloud still reads as
 * data rather than as decoration.
 */
export const POINT_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute float aMagnitude;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
uniform float uOpacity;
uniform float uFadeStart;
uniform float uFadeEnd;

void main() {
  vColor = color;
  vAlpha = uOpacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float distanceToCamera = -mvPosition.z;
  // Distance fade so distant objects thin out instead of forming a solid haze.
  vAlpha *= 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceToCamera);
  float size = aSize * uScale * (1.0 + abs(aMagnitude) * 0.02);
  gl_PointSize = clamp(size * (300.0 / max(1.0, distanceToCamera)), 1.0, 42.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const POINT_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float radius = length(centered);
  if (radius > 0.5) discard;
  float falloff = smoothstep(0.5, 0.12, radius);
  gl_FragColor = vec4(vColor, vAlpha * falloff);
}
`

/**
 * Star field. Stars sit on a unit sphere around the camera so they never show
 * parallax; brightness follows the catalogue magnitude and the colour follows the
 * B-V index.
 */
export const STAR_VERTEX_SHADER = /* glsl */ `
attribute float aMagnitude;
attribute vec3 aColor;
uniform float uScale;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBrightness;

void main() {
  vColor = aColor;
  float magnitude = aMagnitude;
  // Naked-eye scale: mag 0 is bright, mag 7 is barely visible.
  vBrightness = clamp(1.0 - (magnitude + 1.5) / 9.0, 0.06, 1.0);
  gl_PointSize = clamp(uScale * vBrightness * uPixelRatio, 1.0, 6.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const STAR_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vBrightness;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float radius = length(centered);
  if (radius > 0.5) discard;
  float core = smoothstep(0.5, 0.0, radius);
  gl_FragColor = vec4(vColor * vBrightness, core * vBrightness);
}
`

/**
 * Adds the equatorial-to-ecliptic rotation as a shader-side uniform block for the
 * atmosphere shell, which needs the Sun direction in view space.
 */
export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec3 vWorldNormal;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vViewDirection = normalize(-viewPosition.xyz);
  gl_Position = projectionMatrix * viewPosition;
}
`