/**
 * Download the surface-map texture set used by the renderer.
 *
 * Source: Solar System Scope planetary texture maps (CC BY 4.0),
 * https://www.solarsystemscope.com/textures/ — derived from NASA elevation and
 * imagery data (NASA/USGS, public domain).
 *
 * Textures are stored next to the application so that an exhibition installation
 * runs completely offline (see docs/exhibition-deployment.md).
 *
 * Usage:  NODE_USE_ENV_PROXY=1 node scripts/update-textures.mjs
 */
import path from 'node:path'
import { PUBLIC_DATA_DIR, httpBuffer, log, writeBuffer, writeJson } from './lib/io.mjs'

const SOURCE_BASE = 'https://www.solarsystemscope.com/textures/download'
const THREE_BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets'

const TEXTURES = [
  { file: 'sun.jpg', url: `${SOURCE_BASE}/2k_sun.jpg`, license: 'CC BY 4.0' },
  { file: 'mercury.jpg', url: `${SOURCE_BASE}/2k_mercury.jpg`, license: 'CC BY 4.0' },
  { file: 'venus-surface.jpg', url: `${SOURCE_BASE}/2k_venus_surface.jpg`, license: 'CC BY 4.0' },
  { file: 'venus-atmosphere.jpg', url: `${SOURCE_BASE}/2k_venus_atmosphere.jpg`, license: 'CC BY 4.0' },
  { file: 'earth-day.jpg', url: `${SOURCE_BASE}/2k_earth_daymap.jpg`, license: 'CC BY 4.0' },
  { file: 'earth-night.jpg', url: `${SOURCE_BASE}/2k_earth_nightmap.jpg`, license: 'CC BY 4.0' },
  { file: 'earth-clouds.jpg', url: `${SOURCE_BASE}/2k_earth_clouds.jpg`, license: 'CC BY 4.0' },
  { file: 'earth-normal.jpg', url: `${THREE_BASE}/earth_normal_2048.jpg`, license: 'MIT (three.js examples)' },
  { file: 'earth-specular.jpg', url: `${THREE_BASE}/earth_specular_2048.jpg`, license: 'MIT (three.js examples)' },
  { file: 'mars.jpg', url: `${SOURCE_BASE}/2k_mars.jpg`, license: 'CC BY 4.0' },
  { file: 'jupiter.jpg', url: `${SOURCE_BASE}/2k_jupiter.jpg`, license: 'CC BY 4.0' },
  { file: 'saturn.jpg', url: `${SOURCE_BASE}/2k_saturn.jpg`, license: 'CC BY 4.0' },
  { file: 'saturn-ring.png', url: `${SOURCE_BASE}/2k_saturn_ring_alpha.png`, license: 'CC BY 4.0' },
  { file: 'uranus.jpg', url: `${SOURCE_BASE}/2k_uranus.jpg`, license: 'CC BY 4.0' },
  { file: 'neptune.jpg', url: `${SOURCE_BASE}/2k_neptune.jpg`, license: 'CC BY 4.0' },
  { file: 'moon.jpg', url: `${SOURCE_BASE}/2k_moon.jpg`, license: 'CC BY 4.0' },
  { file: 'milkyway.jpg', url: `${SOURCE_BASE}/2k_stars_milky_way.jpg`, license: 'CC BY 4.0' },
]

async function main() {
  const dir = path.join(PUBLIC_DATA_DIR, 'textures')
  log('Downloading planetary texture maps ...')
  const manifest = []
  for (const texture of TEXTURES) {
    const buffer = await httpBuffer(texture.url)
    const target = path.join(dir, texture.file)
    await writeBuffer(target, buffer)
    manifest.push({
      file: `textures/${texture.file}`,
      source: texture.url,
      license: texture.license,
      bytes: buffer.byteLength,
    })
  }
  await writeJson(path.join(dir, 'textures.json'), {
    $comment:
      'Surface maps downloaded by scripts/update-textures.mjs. Solar System Scope maps are CC BY 4.0 and derived from NASA/USGS data; the three.js example maps are MIT. Textures are resolved at runtime through textureTiers() in src/data/TextureProvider.ts, which falls back to a procedural map when a file is unavailable.',
    retrievedAt: new Date().toISOString(),
    totalBytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0),
    textures: manifest,
  })
  log(`Textures: ${manifest.length} files, ${(manifest.reduce((s, e) => s + e.bytes, 0) / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`)
  process.exit(1)
})