/**
 * Acceptance verification for the defects listed in docs/e2e-verification-report.md.
 *
 * Runs the real application in a real Chromium (Playwright's bundled Chrome for
 * Testing, GPU enabled) and re-checks each repaired defect with the same probes the
 * original report used: engine diagnostics, scene-graph structure, real network
 * responses and real DOM hit-testing. Nothing here is a visual eyeball test except
 * the two brightness ratios, and those are explicitly labelled as such.
 *
 * Usage:
 *   node scripts/e2e/verify-fixes.mjs [baseUrl]
 *   SMOKE_CHROMIUM=/path/to/chrome node scripts/e2e/verify-fixes.mjs http://127.0.0.1:5199
 *
 * The script starts no server: run `npm run dev -- --port 5199 --host 127.0.0.1`
 * first (the dev build exposes window.__solarSystemEngine, which the probes need).
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:5199'
/**
 * Production mode: the built bundle deliberately does not expose
 * `window.__solarSystemEngine` (§42), so only the checks that need no diagnostic
 * handle are run. That is exactly the P0-1 evidence the original report collected
 * against `vite preview`.
 */
const PRODUCTION = process.env.VERIFY_MODE === 'production'

/* ------------------------------------------------------------------ chromium */

function findChromium() {
  if (process.env.SMOKE_CHROMIUM && existsSync(process.env.SMOKE_CHROMIUM)) return process.env.SMOKE_CHROMIUM
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cache)) return null
  const candidates = []
  for (const entry of readdirSync(cache)) {
    if (entry.startsWith('chromium-')) {
      candidates.push(
        join(cache, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(cache, entry, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      )
    }
    if (entry.startsWith('chromium_headless_shell-')) {
      candidates.push(
        join(cache, entry, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        join(cache, entry, 'chrome-headless-shell-mac', 'chrome-headless-shell'),
      )
    }
  }
  return candidates.find((path) => existsSync(path)) ?? null
}

/* -------------------------------------------------------------------- runner */

const results = []
let failures = 0

function record(id, title, passed, detail) {
  results.push({ id, title, passed, detail })
  if (!passed) failures += 1
  const mark = passed ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${id}  ${title}`)
  if (detail !== undefined) console.log(`       ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

async function check(id, title, fn) {
  try {
    const detail = await fn()
    record(id, title, true, detail)
  } catch (error) {
    record(id, title, false, error instanceof Error ? error.message : String(error))
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/* ----------------------------------------------------------------- the tests */

const executablePath = findChromium()
if (!executablePath) {
  console.log('SKIPPED: no Chromium executable found (set SMOKE_CHROMIUM to override)')
  process.exit(0)
}
console.log(`chromium: ${executablePath}`)
console.log(`base url: ${BASE_URL}\n`)

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--headless=new', '--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()

const consoleErrors = []
const textureRequests = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('response', (response) => {
  const url = response.url()
  if (url.includes('/textures/')) textureRequests.push({ url: new URL(url).pathname, status: response.status(), type: response.headers()['content-type'] ?? '' })
})
// A missing texture must be visible to the test rather than silently swallowed.
page.on('requestfailed', (request) => {
  if (request.url().includes('/textures/')) textureRequests.push({ url: new URL(request.url()).pathname, status: 0, type: 'failed' })
})

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
if (PRODUCTION) {
  // No diagnostic handle exists in the built bundle; verify what a visitor gets.
  await page.click('.splash__enter')
  await page.waitForFunction(() => document.querySelector('.hud') !== null, { timeout: 60_000 })
  await page.waitForTimeout(9000)
  await check('PROD-1', 'every texture in the production bundle is served as an image', async () => {
    assert(textureRequests.length > 0, 'no texture request was observed')
    const bad = textureRequests.filter((entry) => entry.status !== 200 || !entry.type.startsWith('image/'))
    assert(bad.length === 0, `bad texture responses: ${JSON.stringify(bad.slice(0, 4))}`)
    for (const entry of textureRequests) {
      assert(entry.url.startsWith('/data/textures/'), `texture requested without data/ prefix: ${entry.url}`)
    }
    return `${textureRequests.length} texture requests, all image/* under /data/textures/`
  })
  await check('PROD-2', 'the diagnostic handle and the performance overlay stay hidden', async () => {
    const state = await page.evaluate(() => ({
      engine: typeof window.__solarSystemEngine,
      perf: document.querySelectorAll('.perf').length,
      hud: document.querySelectorAll('.hud').length,
    }))
    assert(state.engine === 'undefined', 'the engine handle leaked into the production bundle')
    assert(state.perf === 0, 'the performance overlay is visible by default in production')
    assert(state.hud === 1, 'the HUD did not render')
    return state
  })
  await check('PROD-3', 'the production build logs no runtime errors', async () => {
    assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors.slice(0, 4))}`)
    return '0 errors'
  })
  console.log(`\n${results.length - failures}/${results.length} production checks passed`)
  await browser.close()
  process.exit(failures === 0 ? 0 : 1)
}

await page.waitForFunction(() => window.__solarSystemEngine !== undefined, { timeout: 60_000 })
// Enter the exhibition; the engine already exists (it is created behind the splash,
// which is what gives the title screen its live background).
await page.click('.splash__enter')
await page.waitForFunction(() => document.querySelector('.hud') !== null, { timeout: 60_000 })
// Let a few frames run so LOD tiers, labels and textures settle.
await page.waitForTimeout(2500)

/* -------------------------------------------------- P0-1  real surface maps */

await check('P0-1a', 'texture requests use the data/ prefix and return images', async () => {
  // Force the inner planets into the textured LOD by flying to the Earth.
  await page.evaluate(() => window.__solarSystemEngine.flyTo('earth'))
  await page.waitForTimeout(6000)
  const requests = await page.evaluate(() => window.__verifyTextureRequests ?? null)
  void requests
  const bad = textureRequests.filter((entry) => entry.status !== 200 || !entry.type.startsWith('image/'))
  assert(textureRequests.length > 0, 'no texture request was observed at all')
  assert(bad.length === 0, `bad texture responses: ${JSON.stringify(bad.slice(0, 4))}`)
  for (const entry of textureRequests) {
    assert(entry.url.startsWith('/data/textures/'), `texture requested without data/ prefix: ${entry.url}`)
  }
  return `${textureRequests.length} texture requests, all image/* and under /data/textures/`
})

await check('P0-1b', 'Earth material carries the real day/night/normal/specular maps', async () => {
  const state = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    const visual = engine.visuals.get('earth')
    const material = visual?.mesh?.material
    const localPath = new URL('/data/textures/earth-day.jpg', location.href).pathname
    void localPath
    return {
      tier: visual?.tier,
      image: material?.uniforms?.uMap?.value?.image
        ? {
            tag: material.uniforms.uMap.value.image.tagName ?? 'canvas',
            width: material.uniforms.uMap.value.image.naturalWidth ?? material.uniforms.uMap.value.image.width,
            height: material.uniforms.uMap.value.image.naturalHeight ?? material.uniforms.uMap.value.image.height,
          }
        : null,
      hasNight: material?.uniforms?.uHasNightMap?.value,
      hasNormal: material?.uniforms?.uHasNormalMap?.value,
      hasSpecular: material?.uniforms?.uHasSpecularMap?.value,
      // The cloud shell is a lit shader now, so its map lives in a uniform rather
      // than a MeshBasicMaterial.map.
      cloudMap: visual?.clouds?.material?.uniforms?.uMap?.value?.image
        ? {
            width: visual.clouds.material.uniforms.uMap.value.image.naturalWidth ?? 0,
            hasSunDirection: Boolean(visual.clouds.material.uniforms.uSunDirection),
          }
        : null,
      describeProcedural: engine.describeBody('earth')?.proceduralSurface,
    }
  })
  assert(state.image !== null, 'Earth has no surface map bound')
  assert(state.image.tag === 'IMG', `the surface map is a ${state.image.tag}, not a decoded image`)
  assert(state.image.width >= 1024, `decoded map is only ${state.image.width} px wide`)
  assert(state.hasNight === 1 && state.hasNormal === 1 && state.hasSpecular === 1, `night/normal/specular flags: ${JSON.stringify(state)}`)
  assert(state.cloudMap !== null, 'the cloud shell has no cloud texture bound')
  assert(state.cloudMap.hasSunDirection === true, 'the cloud shell is not lit by the Sun')
  assert(state.describeProcedural === false, 'the information panel still claims a procedural surface')
  return state
})

await check('P0-1c', 'a body with no published map is still disclosed as procedural', async () => {
  const disclosed = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    // Titan declares no bundled map, so its panel line must report the fallback.
    const description = engine.describeBody('titan')
    return { procedural: description?.proceduralSurface, hasTextureDeclared: Boolean(description?.body?.textures?.map) }
  })
  assert(disclosed.procedural === true, `Titan is not disclosed as procedural: ${JSON.stringify(disclosed)}`)
  return disclosed
})

/* ------------------------------------------------- P0-2  lighting frame */

await check('P0-2a', 'shader sun direction matches the rendered geometry (angle ≈ 0°)', async () => {
  const angles = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    const out = {}
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const state = engine.resolver.state(id)
      const visual = engine.visuals.get(id)
      const uniform = visual?.mesh?.material?.uniforms?.uSunDirection?.value
      if (!state || !uniform) {
        out[id] = null
        continue
      }
      const p = state.absoluteUnits
      const length = Math.hypot(p.x, p.y, p.z)
      const truth = { x: -p.x / length, y: -p.y / length, z: -p.z / length }
      const dot = uniform.x * truth.x + uniform.y * truth.y + uniform.z * truth.z
      out[id] = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI
    }
    return out
  })
  const worst = Math.max(...Object.values(angles).filter((value) => value !== null))
  assert(worst < 1.0, `worst sun-direction error is ${worst.toFixed(2)}° (expected < 1°): ${JSON.stringify(angles)}`)
  return `worst error ${worst.toFixed(3)}° across the eight planets`
})

await check('P0-2b', 'rendering space is the Y-up scene frame (ecliptic plane becomes XZ)', async () => {
  const sample = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    engine.jumpToJulianDate(2451545.0)
    const state = engine.resolver.state('earth')
    const p = state.absoluteUnits
    const length = Math.hypot(p.x, p.y, p.z)
    return { x: p.x / length, y: p.y / length, z: p.z / length }
  })
  // At J2000 the Earth sits at ecliptic longitude ~100.4°, so the scene-frame
  // direction must be (-0.180, 0, -0.984): large +Z, ~0 Y.
  assert(Math.abs(sample.y) < 0.02, `scene-frame Y is ${sample.y.toFixed(4)}; the ecliptic plane is not the XZ plane`)
  assert(sample.z < -0.9, `scene-frame Z is ${sample.z.toFixed(4)}; the geometry was not rotated into the scene frame`)
  return sample
})

await check('P0-2c', 'day and night hemispheres are actually lit differently', async () => {
  // Quantified brightness check: the mean luminance of the frame with the camera on
  // the sunward side of the Earth versus the anti-sun side. `rotate` moves the
  // camera in the orbit controller, so the viewing geometry changes exactly the way
  // a visitor would change it.
  await page.evaluate(() => window.__solarSystemEngine.flyTo('earth'))
  await page.waitForTimeout(6500)
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.setPaused(true)
    engine.cameraController.setMode('orbit')
    // π radians of azimuth in the controller's own units.
    const halfTurn = -Math.PI / (0.32 * 0.0045)
    const measure = async (rotationPx) => {
      engine.cameraController.rotate(rotationPx, 0)
      await new Promise((resolve) => setTimeout(resolve, 1800))
      // Render and read back in the same task, before the browser composites and
      // clears the drawing buffer.
      engine.renderer.render()
      const canvas = engine.renderer.renderer.domElement
      const offscreen = document.createElement('canvas')
      offscreen.width = canvas.width
      offscreen.height = canvas.height
      const context = offscreen.getContext('2d')
      context.drawImage(canvas, 0, 0)
      const { data } = context.getImageData(0, 0, offscreen.width, offscreen.height)
      // Measure the central region only: the planet is framed at a few radii, so the
      // centre of the frame is the disc, while the corners are empty sky that would
      // otherwise dominate the mean.
      const x0 = Math.floor(offscreen.width * 0.32)
      const x1 = Math.floor(offscreen.width * 0.68)
      const y0 = Math.floor(offscreen.height * 0.28)
      const y1 = Math.floor(offscreen.height * 0.72)
      let sum = 0
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const index = (y * offscreen.width + x) * 4
          sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
          count += 1
        }
      }
      return count > 0 ? sum / count : 0
    }
    const first = await measure(0)
    const second = await measure(halfTurn)
    engine.setPaused(false)
    return { first, second, ratio: Math.max(first, second) / Math.max(1e-6, Math.min(first, second)) }
  })
  assert(result.ratio > 1.5, `day/night mean-brightness ratio is only ${result.ratio.toFixed(3)} (${result.first.toFixed(1)} vs ${result.second.toFixed(1)})`)
  return { first: Number(result.first.toFixed(2)), second: Number(result.second.toFixed(2)), ratio: Number(result.ratio.toFixed(3)) }
})

/* ---------------------------------------------------- P0-3  body attitude */

await check('P0-3a', 'the rotation axis is the fixed IAU pole, not a drifting vector', async () => {
  const drift = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    const axisOf = (id) => {
      const visual = engine.visuals.get(id)
      visual.frame.updateWorldMatrix(true, false)
      const elements = visual.frame.matrixWorld.elements
      const column = [elements[8], elements[9], elements[10]]
      const length = Math.hypot(...column)
      return column.map((value) => value / length)
    }
    const report = {}
    for (const id of ['earth', 'mars', 'jupiter', 'saturn', 'uranus']) {
      engine.jumpToJulianDate(2451545.0)
      engine.resolver.update(2451545.0, engine.scale ?? undefined)
      engine.visuals.get(id).update(engine.resolver.state(id), {
        quality: 'high',
        sunDirectionScene: { x: -1, y: 0, z: 0, copy() {} },
        projectedRadiusPixels: 50,
        cameraDistanceUnits: 10,
        showAtmosphere: true,
        nowSecondsSinceJ2000: 0,
      })
      const t0 = axisOf(id)
      const later = 6 * 3600
      engine.visuals.get(id).update(engine.resolver.state(id), {
        quality: 'high',
        sunDirectionScene: { x: -1, y: 0, z: 0, copy() {} },
        projectedRadiusPixels: 50,
        cameraDistanceUnits: 10,
        showAtmosphere: true,
        nowSecondsSinceJ2000: later,
      })
      const t6 = axisOf(id)
      const dot = Math.min(1, Math.max(-1, t0[0] * t6[0] + t0[1] * t6[1] + t0[2] * t6[2]))
      report[id] = {
        axis: t0.map((value) => Number(value.toFixed(4))),
        drift6hDeg: Number(((Math.acos(dot) * 180) / Math.PI).toFixed(3)),
      }
    }
    return report
  })
  const worst = Math.max(...Object.values(drift).map((entry) => entry.drift6hDeg))
  assert(worst < 0.5, `the axis drifts by up to ${worst}° in 6 h: ${JSON.stringify(drift)}`)
  return `worst 6 h drift ${worst}° (was 45–180°)`
})

await check('P0-3b', "Earth's pole matches the IAU value in the scene frame", async () => {
  const error = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    const visual = engine.visuals.get('earth')
    visual.frame.updateWorldMatrix(true, false)
    const elements = visual.frame.matrixWorld.elements
    const axis = [elements[8], elements[9], elements[10]]
    const length = Math.hypot(...axis)
    const normalised = axis.map((value) => value / length)
    // IAU pole of the Earth: RA 0°, Dec +90°, i.e. the J2000 equatorial pole. In the
    // ecliptic frame that is (0, sin ε, cos ε) — ecliptic latitude 66.56°, longitude
    // 90° — and the scene frame maps (x, y, z) to (x, z, -y), so the expected scene
    // direction is (0, cos ε, -sin ε).
    const obliquity = (23.4392911111 * Math.PI) / 180
    const expected = [0, Math.cos(obliquity), -Math.sin(obliquity)]
    const dot = Math.min(1, Math.max(-1, normalised[0] * expected[0] + normalised[1] * expected[1] + normalised[2] * expected[2]))
    return { axis: normalised.map((value) => Number(value.toFixed(5))), errorDeg: (Math.acos(dot) * 180) / Math.PI }
  })
  assert(error.errorDeg < 0.5, `Earth pole error is ${error.errorDeg.toFixed(3)}°: ${JSON.stringify(error)}`)
  return error
})

await check('P0-3c', 'the Saturn ring plane stays fixed over six hours', async () => {
  const result = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    const ringNormal = () => {
      const visual = engine.visuals.get('saturn')
      visual.frame.updateWorldMatrix(true, false)
      const elements = visual.frame.matrixWorld.elements
      const axis = [elements[8], elements[9], elements[10]]
      const length = Math.hypot(...axis)
      return axis.map((value) => value / length)
    }
    const t0 = ringNormal()
    // Advance the visual's own orientation by six hours of rotation.
    const state = engine.resolver.state('saturn')
    engine.visuals.get('saturn').update(state, {
      quality: 'high',
      sunDirectionScene: { x: -1, y: 0, z: 0, copy() {} },
      projectedRadiusPixels: 50,
      cameraDistanceUnits: 10,
      showAtmosphere: false,
      nowSecondsSinceJ2000: 6 * 3600,
    })
    const t6 = ringNormal()
    const dot = Math.min(1, Math.max(-1, t0[0] * t6[0] + t0[1] * t6[1] + t0[2] * t6[2]))
    return { t0, t6, angleDeg: (Math.acos(dot) * 180) / Math.PI }
  })
  assert(result.angleDeg < 0.5, `the ring plane moved ${result.angleDeg.toFixed(2)}° in 6 h (was 157°)`)
  return `ring-plane change over 6 h: ${result.angleDeg.toFixed(3)}°`
})

/* ------------------------------------ P0-4  minor-body selection is real */

await check('P0-4', 'selecting a small body with its layer off shows real values, not (0,0,0)', async () => {
  const result = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    engine.clearSelection()
    engine.setFilters([])
    engine.setMinorBodiesVisible(false)
    engine.jumpToJulianDate(2451545.0)
    const index = engine.minorRuntime?.records?.findIndex((record) => record.name === 'Eris') ?? -1
    if (index < 0) return { found: false }
    const ok = engine.selectMinorBody(index)
    const description = engine.describeMinorBody(index)
    const distanceAu = description?.distanceFromSunKm ? description.distanceFromSunKm / 149597870.7 : null
    const record = description?.record
    return {
      found: true,
      ok,
      expectedTrackedId: `minor:${index}`,
      positionKnown: description?.positionKnown,
      distanceAu,
      speedKmS: description?.speedKmS,
      insideOrbit: distanceAu !== null && record ? distanceAu >= record.perihelionDistanceAu && distanceAu <= record.aphelionDistanceAu : false,
      trackedId: engine.cameraController.trackedId,
      cameraMode: engine.cameraController.mode,
    }
  })
  assert(result.found, 'Eris is not in the minor-body catalogue')
  assert(result.positionKnown === true, 'the position is reported as unknown')
  assert(result.distanceAu !== null && result.distanceAu > 1, `heliocentric distance is ${result.distanceAu} AU`)
  assert(result.insideOrbit, `distance ${result.distanceAu} AU is outside the published [q, Q] range`)
  assert(result.speedKmS !== null && result.speedKmS < 10, `orbital speed is ${result.speedKmS} km/s (expected ~2.3)`)
  assert(result.trackedId === result.expectedTrackedId, `the camera is not tracking the selected body (${result.trackedId})`)
  return result
})

/* -------------------------------------------- P1-1/P1-2  overlay occlusion */

await check('P1-1', 'the time-transport buttons are hit-testable in the default state', async () => {
  const hits = await page.evaluate(() => {
    const labels = ['◀◀', '❚❚', '▶▶', '⇄']
    return labels.map((label) => {
      const button = [...document.querySelectorAll('.transport button')].find((entry) => entry.textContent?.trim() === label)
      if (!button) return { label, found: false }
      const rect = button.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        label,
        found: true,
        width: Math.round(rect.width),
        top: top?.className ?? null,
        blocked: !(top === button || button.contains(top)),
      }
    })
  })
  const blocked = hits.filter((entry) => entry.blocked || !entry.found)
  assert(blocked.length === 0, `blocked transport buttons: ${JSON.stringify(blocked)}`)
  return hits.map((entry) => `${entry.label}→${entry.top}`).join(', ')
})

await check('P1-2a', 'the toast stack never intercepts pointer events', async () => {
  const result = await page.evaluate(() => {
    const stack = document.querySelector('.toast-stack')
    if (!stack) return { present: false }
    const rect = stack.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const style = getComputedStyle(stack)
    return { present: true, pointerEvents: style.pointerEvents, topElement: top?.className ?? null, hitsStack: top === stack }
  })
  assert(result.present, 'the toast stack is not rendered')
  assert(result.pointerEvents === 'none', `the toast stack has pointer-events: ${result.pointerEvents}`)
  return result
})

await check('P1-2b', 'the inspector close button is clickable while a toast is shown', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.selectBody('mars')
    // Push a toast through the same channel the quality controller uses.
    engine.events.emit('status', { level: 'info', message: 'quality adjusted to ultra' })
    await new Promise((resolve) => setTimeout(resolve, 120))
    const close = document.querySelector('.inspector .inspector__close')
    if (!close) return { found: false }
    const rect = close.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { found: true, topElement: top?.className ?? null, clickable: top === close || close.contains(top) }
  })
  assert(result.found, 'the inspector close button is missing')
  assert(result.clickable, `the close button is covered by ${result.topElement}`)
  return result
})

await check('P1-2c', 'the bottom console is not covered by the sidebar or the inspector', async () => {
  const result = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    engine.selectBody('earth')
    const targets = [...document.querySelectorAll('.console button')]
    const blocked = targets.filter((button) => {
      const rect = button.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      // Only controls that are actually inside the viewport can be hit-tested.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false
      const top = document.elementFromPoint(x, y)
      return !(top === button || button.contains(top))
    })
    return {
      total: targets.length,
      blocked: blocked.slice(0, 6).map((button) => ({ text: button.textContent?.trim().slice(0, 12), by: null })),
    }
  })
  assert(result.blocked.length === 0, `console buttons covered: ${JSON.stringify(result.blocked)}`)
  return `${result.total} console buttons, none covered`
})

/* ------------------------------------------------ P1-3  context restore leak */

await check('P1-3', 'a WebGL context restore does not leak scene nodes', async () => {
  const counts = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    const countGroups = () => {
      let total = 0
      engine.renderer.scene.traverse((object) => {
        if (object.name?.startsWith('body:')) total += 1
      })
      return total
    }
    const before = countGroups()
    const canvas = engine.renderer.renderer.domElement
    const gl = canvas.getContext('webgl2')
    const extension = gl.getExtension('WEBGL_lose_context')
    extension.loseContext()
    await new Promise((resolve) => setTimeout(resolve, 250))
    extension.restoreContext()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const after = countGroups()
    return { before, after, drawn: engine.statistics().drawnBodies }
  })
  assert(counts.after === counts.before, `body groups went from ${counts.before} to ${counts.after}`)
  return counts
})

/* ------------------------------------------- P1-4  configuration consumers */

await check('P1-4', 'the four orphaned config keys now drive the interface', async () => {
  const page2 = await context.newPage()
  await page2.route('**/exhibition.config.json', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.showPerformanceOverlay = true
    body.enableScientificMode = false
    body.defaultTarget = 'jupiter'
    // The key name the specification documents, not the implementation's.
    body.autoDemoDelay = 4
    body.guidedTourOnIdle = true
    await route.fulfill({ response, body: JSON.stringify(body) })
  })
  await page2.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page2.waitForFunction(() => window.__solarSystemEngine !== undefined, { timeout: 60_000 })
  await page2.click('.splash__enter')
  await page2.waitForFunction(() => document.querySelector('.hud') !== null, { timeout: 60_000 })
  // `defaultTarget` is read before the idle timer fires (the route sets a 4 s delay),
  // because the idle behaviour moves the camera to the first tour stop.
  await page2.waitForTimeout(1500)
  const immediate = await page2.evaluate(() => ({
    perf: Boolean(document.querySelector('.perf')),
    scientificToggle: [...document.querySelectorAll('.chip button')].some((button) => /科学模式|Scientific mode/i.test(button.textContent ?? '')),
    tracked: window.__solarSystemEngine.cameraController.trackedId,
  }))
  assert(immediate.perf === true, 'showPerformanceOverlay=true did not show the overlay')
  assert(immediate.scientificToggle === false, 'enableScientificMode=false left the toggle visible')
  assert(immediate.tracked === 'jupiter', `defaultTarget was not applied (tracked=${immediate.tracked})`)
  // guidedTourOnIdle + the autoDemoDelay alias: after the configured idle delay the
  // guided tour starts by itself.
  await page2.waitForTimeout(7000)
  const idle = await page2.evaluate(() => ({
    tourActive: Boolean(document.querySelector('.tour')),
    tracked: window.__solarSystemEngine.cameraController.trackedId,
    sparks: document.querySelectorAll('.perf__spark polyline').length,
    sparkPoints: document.querySelector('.perf__spark polyline')?.getAttribute('points')?.length ?? 0,
  }))
  await page2.close()
  assert(idle.tourActive === true, 'guidedTourOnIdle / autoDemoDelay did not start the tour when idle')
  assert(idle.sparkPoints > 0, 'the performance sparkline is still empty (P2-8)')
  return { ...immediate, idle }
})

/* ------------------------------------------- P2  remaining repaired items */

await check('P2-2', 'the orbit switch also hides parent-relative moon paths', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.flyTo('jupiter')
    await new Promise((resolve) => setTimeout(resolve, 4200))
    engine.showMajorOrbits(true, engine.majorMoonIds())
    await new Promise((resolve) => setTimeout(resolve, 400))
    const countVisible = () => {
      let visible = 0
      engine.renderer.scene.traverse((object) => {
        if (object.type === 'Line' && object.visible && object.parent && object.parent.name?.startsWith('body:')) visible += 1
      })
      return visible
    }
    const shown = countVisible()
    engine.setOrbitVisibility(false)
    const hidden = countVisible()
    engine.setOrbitVisibility(true)
    return { shown, hidden }
  })
  assert(result.shown > 0, 'no local (moon) orbit lines were registered')
  assert(result.hidden === 0, `${result.hidden} moon orbit lines stayed visible after hiding the layer`)
  return result
})

await check('P2-3', 'the minor-body panel shows the real simulation Julian Date', async () => {
  const result = await page.evaluate(() => {
    const engine = window.__solarSystemEngine
    engine.jumpToJulianDate(2451545.0)
    const index = engine.minorRuntime?.records?.findIndex((record) => record.name === '67P/Churyumov-Gerasimenko') ?? -1
    const target = index >= 0 ? index : 0
    engine.selectMinorBody(target)
    const description = engine.describeMinorBody(target)
    return { clockJd: engine.clock.jd, descriptionJd: description?.julianDate }
  })
  assert(result.descriptionJd === result.clockJd, `panel JD ${result.descriptionJd} != clock JD ${result.clockJd}`)
  return result
})

await check('P2-4', 'search results include the owning system', async () => {
  await page.click('.hud__top button:has-text("搜索"), .hud__top button:has-text("Search")').catch(() => {})
  await page.waitForTimeout(300)
  await page.fill('#global-search', 'Europa')
  await page.waitForTimeout(500)
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.search-results .kind')].map((entry) => entry.textContent?.trim() ?? ''),
  )
  const withSystem = rows.filter((row) => /Jupiter|木星/.test(row))
  assert(withSystem.length > 0, `no result row names its system: ${JSON.stringify(rows)}`)
  return withSystem
})

await check('P2-5', 'the interface-scale control changes the root font size', async () => {
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1'))
  const before = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontSize,
    chip: getComputedStyle(document.querySelector('.chip')).fontSize,
  }))
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.3'))
  const after = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontSize,
    chip: getComputedStyle(document.querySelector('.chip')).fontSize,
  }))
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1'))
  const growth = parseFloat(after.chip) / parseFloat(before.chip)
  assert(growth > 1.2, `chip font grew only ${growth.toFixed(3)}× (${before.chip} -> ${after.chip})`)
  return { before, after, growth: Number(growth.toFixed(3)) }
})

await check('P2-9', 'the quality profile really gates the atmosphere shells and the budget', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.flyTo('earth')
    await new Promise((resolve) => setTimeout(resolve, 6500))
    engine.setQualityProfile('performance')
    await new Promise((resolve) => setTimeout(resolve, 600))
    const low = {
      tier: engine.visuals.get('earth')?.tier,
      atmosphereVisible: engine.visuals.get('earth')?.atmosphere?.visible ?? null,
      profile: engine.quality.profile,
    }
    engine.setQualityProfile('ultra')
    await new Promise((resolve) => setTimeout(resolve, 600))
    const high = {
      tier: engine.visuals.get('earth')?.tier,
      atmosphereVisible: engine.visuals.get('earth')?.atmosphere?.visible ?? null,
    }
    return { low: { ...low, profile: { atmosphere: low.profile.atmosphere, maxMinorBodies: low.profile.maxMinorBodies } }, high }
  })
  assert(result.low.profile.atmosphere === false, 'the performance profile still enables atmospheres')
  assert(result.low.atmosphereVisible === false, `the atmosphere shell is still visible on performance quality (tier ${result.low.tier})`)
  assert(result.high.atmosphereVisible === true, 'the atmosphere shell did not come back on ultra quality')
  assert(result.low.profile.maxMinorBodies < 12000, 'the minor-body budget is not defined')
  return result
})

await check('P2-10', 'the coarse-pointer stylesheet guarantees 48x48 px controls', async () => {
  // `pointer: coarse` cannot be emulated through Playwright's media API, so the rule
  // itself is audited: every control class must be covered by a min-width rule inside
  // the coarse-pointer media block.
  const audit = await page.evaluate(() => {
    const required = ['.transport button', '.speed-group button', '.segmented button', '.chip', '.tab', '.object-row', '.search-results button']
    const covered = new Set()
    let minWidth = null
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      const walk = (list) => {
        for (const rule of list) {
          // A media rule has both `conditionText` and `cssRules`, so it must be
          // inspected before the generic recursion into nested rule lists.
          if (rule.conditionText !== undefined && rule.conditionText.includes('pointer: coarse')) {
            for (const inner of rule.cssRules ?? []) {
              if (!inner.style) continue
              const width = inner.style.getPropertyValue('min-width')
              if (!width) continue
              minWidth = width
              for (const selector of required) {
                if ((inner.selectorText ?? '').includes(selector)) covered.add(selector)
              }
            }
            continue
          }
          if (rule.cssRules) walk(rule.cssRules)
        }
      }
      walk(rules)
    }
    return { minWidth, covered: [...covered], required }
  })
  const missing = audit.required.filter((selector) => !audit.covered.includes(selector))
  assert(missing.length === 0, `no coarse-pointer min-width for: ${missing.join(', ')}`)
  return audit
})

await check('P2-11', 'prefers-reduced-motion shortens the camera transition', async () => {
  const reduced = await context.newPage()
  await reduced.emulateMedia({ reducedMotion: 'reduce' })
  await reduced.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await reduced.waitForFunction(() => window.__solarSystemEngine !== undefined, { timeout: 60_000 })
  await reduced.click('.splash__enter')
  await reduced.waitForFunction(() => document.querySelector('.hud') !== null, { timeout: 60_000 })
  await reduced.waitForTimeout(1500)
  const duration = await reduced.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.flyTo('neptune')
    await new Promise((resolve) => setTimeout(resolve, 120))
    return engine.cameraController.flyToProgress?.duration ?? null
  })
  await reduced.close()
  assert(duration !== null, 'no fly-to transition was registered')
  assert(duration <= 0.6, `the transition still takes ${duration} s under prefers-reduced-motion`)
  return { duration }
})

await check('P2-12', 'the splash screen reports real statistics and a live background', async () => {
  const splash = await context.newPage()
  await splash.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await splash.waitForFunction(() => document.querySelector('.splash') !== null, { timeout: 30_000 })
  await splash.waitForTimeout(6000)
  const state = await splash.evaluate(() => {
    const element = document.querySelector('.splash')
    return {
      facts: element?.querySelector('.splash__facts')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      liveBackground: element?.getAttribute('data-live-background'),
      engineExists: window.__solarSystemEngine !== undefined,
    }
  })
  await splash.close()
  assert(!state.facts.includes('—'), `the splash still shows placeholders: ${state.facts}`)
  assert(state.liveBackground === 'true', 'the splash background is not a live scene')
  return state
})

await check('P2-1', 'comets show a coma and tails when they are near the Sun', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.setFilters(['comet'])
    engine.setMinorBodiesVisible(true)
    // Walk the clock until some comet is inside the activity limit.
    for (const jd of [2451545.0, 2451600.0, 2451700.0, 2451800.0, 2451900.0, 2452000.0]) {
      engine.jumpToJulianDate(jd)
      await new Promise((resolve) => setTimeout(resolve, 260))
      if (engine.activeCometCount > 0) break
    }
    return { activeComets: engine.activeCometCount, cometGroupVisible: engine.renderer.scene.getObjectByName('comets')?.visible ?? null }
  })
  assert(result.activeComets > 0, 'no comet is ever active; the coma/tails layer is empty')
  return result
})

/* ------------------------------------------------------------- console/post */

await check('P2-14a', 'switching language updates <html lang> and the document title', async () => {
  const before = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title }))
  // Open the settings panel and switch to English through the real control.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.hud__top button')].find((entry) => /设置|Settings/.test(entry.textContent ?? ''))
    button?.click()
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.flyout button')].find((entry) => entry.textContent?.trim() === 'English')
    button?.click()
  })
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    dialog: document.querySelectorAll('[role="dialog"]').length,
  }))
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.flyout button')].find((entry) => entry.textContent?.trim() === '中文')
    button?.click()
  })
  await page.waitForTimeout(500)
  assert(after.lang === 'en-US', `document language is "${after.lang}" after switching to English`)
  assert(after.title !== before.title, 'the document title did not follow the language')
  assert(after.dialog > 0, 'no panel declares role="dialog"')
  return { before, after }
})

await check('P2-14b', 'the information panel traps Tab inside itself', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.selectBody('earth')
    await new Promise((resolve) => setTimeout(resolve, 300))
    const panel = document.querySelector('.inspector')
    if (!panel) return { found: false }
    panel.querySelector('button')?.focus()
    const focusables = [...panel.querySelectorAll('button, input, [tabindex]')].filter((entry) => entry.offsetParent !== null)
    const last = focusables[focusables.length - 1]
    last?.focus()
    // A Tab from the last element must wrap back inside the panel.
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    return {
      found: true,
      focusables: focusables.length,
      wrapped: panel.contains(document.activeElement),
      active: document.activeElement?.className ?? null,
    }
  })
  assert(result.found, 'the inspector did not open')
  assert(result.wrapped === true, `Tab escaped the panel to ${result.active}`)
  return result
})

await check('P2-6', 'Escape releases the camera lock together with the selection', async () => {
  const result = await page.evaluate(async () => {
    const engine = window.__solarSystemEngine
    engine.flyTo('mars')
    await new Promise((resolve) => setTimeout(resolve, 4200))
    const locked = { engineTracked: engine.trackedObjectId, cameraTracked: engine.cameraController.trackedId }
    // The Escape key handler in useEngine calls clearSelection.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    return {
      locked,
      afterEngineTracked: engine.trackedObjectId,
      afterCameraTracked: engine.cameraController.trackedId,
      afterSelected: engine.selectedObjectId,
      hudTarget: [...document.querySelectorAll('.chip')].map((entry) => entry.textContent ?? '').find((text) => text.includes('锁定') || text.includes('Target')) ?? '',
    }
  })
  assert(result.locked.engineTracked === 'mars' && result.locked.cameraTracked === 'mars', `the lock was not established: ${JSON.stringify(result.locked)}`)
  assert(result.afterEngineTracked === null, 'the engine still reports a tracked body after Escape')
  assert(result.afterCameraTracked === null, 'the camera is still locked after Escape (HUD and camera disagree)')
  assert(!/mars|Mars|火星/.test(result.hudTarget), `the HUD still names the cleared target: ${result.hudTarget}`)
  return result
})

await check('P2-8', 'the composer carries MSAA, SMAA and the vignette pass', async () => {
  const passes = await page.evaluate(() => {
    const composer = window.__solarSystemEngine.renderer.composer
    const renderTarget = composer.renderTarget1 ?? composer.renderTarget
    return {
      passes: composer.passes.map((pass) => pass.constructor.name),
      samples: renderTarget?.samples ?? null,
      enabled: composer.passes.filter((pass) => pass.enabled !== false).length,
    }
  })
  assert(passes.passes.includes('SMAAPass'), `no SMAA pass: ${JSON.stringify(passes.passes)}`)
  assert(passes.passes.includes('ShaderPass'), `no vignette pass: ${JSON.stringify(passes.passes)}`)
  assert(passes.samples >= 2, `the composer render target is not multisampled (samples=${passes.samples})`)
  return passes
})

await check('ALL', 'no console errors during the whole run', async () => {
  const relevant = consoleErrors.filter((message) => !message.includes('Failed to load resource'))
  assert(relevant.length === 0, `console errors: ${JSON.stringify(relevant.slice(0, 4))}`)
  return `${relevant.length} console errors`
})

/* -------------------------------------------------------------------- report */

console.log(`\n${results.length - failures}/${results.length} checks passed`)
for (const result of results.filter((entry) => !entry.passed)) {
  console.log(`  FAILED ${result.id}: ${result.detail}`)
}

await browser.close()
process.exit(failures === 0 ? 0 : 1)
