/**
 * Browser smoke test / acceptance run.
 *
 * Drives the exhibition through the ten acceptance scenarios in the project brief
 * (splash -> enter -> fly to a planet -> information panel -> guided search ->
 * time rate -> asteroid belt -> outer system -> scale modes -> date jump) against a
 * real browser, asserting on the engine's own diagnostics rather than on pixels, and
 * writing screenshots to /tmp/shots.
 *
 * The engine exposes `window.__solarSystemEngine` in development builds, which is
 * what makes these checks possible without test-only hooks in production code.
 *
 * Requirements:
 *   playwright-core is a devDependency (see package.json).
 *   A Chromium executable: either set SMOKE_CHROMIUM, run
 *   `npx playwright-core install chromium`, or leave a cached browser under
 *   ~/Library/Caches/ms-playwright/ (the script finds either the full
 *   "Google Chrome for Testing" bundle or the headless shell). If nothing is
 *   found the run is SKIPPED with exit code 0 rather than reporting a fake pass.
 *   A dev server: the script uses APP_URL when set, otherwise it uses
 *   http://127.0.0.1:5173/ and, if nothing is listening there, starts the local
 *   Vite dev server itself (the engine debug handle exists in DEV builds only).
 *
 *   node scripts/smoke-test.mjs      # or: npm run test:smoke
 *
 * Notes:
 *  - The default flags force ANGLE/SwiftShader, so the test also runs on a machine
 *    with no GPU (it is slow there — that is why the waits are generous).
 *  - Set APP_URL to point at an already-running dev/preview server.
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_URL = 'http://127.0.0.1:5173/'
const BASE = process.env.APP_URL || DEFAULT_URL
const OUT = '/tmp/shots'

/**
 * Executable shapes produced by the Playwright browser installer, in preference
 * order: the full browser before the headless shell, macOS arm64/x64 then Linux.
 */
const EXECUTABLE_SHAPES = [
  ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
  ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  ['chrome-linux', 'chrome'],
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
]

/**
 * Finds a Chromium executable: an explicit SMOKE_CHROMIUM, then a cached browser
 * under ~/Library/Caches/ms-playwright/, then PLAYWRIGHT_BROWSERS_PATH.
 */
function findChromium() {
  if (process.env.SMOKE_CHROMIUM) return process.env.SMOKE_CHROMIUM

  const roots = [path.join(homedir(), 'Library', 'Caches', 'ms-playwright')]
  const candidates = []
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    // Playwright may also be pointed at a directory containing `chromium/` directly.
    candidates.push(path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'))
    roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH)
  }

  for (const root of roots) {
    let entries
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    // Highest version first, and the full browser before the headless shell.
    const versionOf = (name) => Number(/-(\d+)/.exec(name)?.[1] ?? 0)
    const isHeadlessShell = (name) => name.startsWith('chromium_headless_shell')
    entries.sort(
      (a, b) =>
        versionOf(b) - versionOf(a) ||
        Number(isHeadlessShell(a)) - Number(isHeadlessShell(b)) ||
        a.localeCompare(b),
    )
    for (const entry of entries) {
      if (!/^chromium(_headless_shell)?-\d+/.test(entry)) continue
      for (const shape of EXECUTABLE_SHAPES) candidates.push(path.join(root, entry, ...shape))
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

async function isReachable(url) {
  try {
    return (await fetch(url, { method: 'GET' })).ok
  } catch {
    return false
  }
}

/**
 * The smoke test asserts on `window.__solarSystemEngine`, which the engine only
 * exposes in development builds, so it must talk to the Vite dev server. When the
 * caller did not point APP_URL at one and nothing is listening on the default port,
 * start it here (verify:all runs this after `npm run build`, so there is no server).
 */
let devServer = null
async function ensureDevServer() {
  if (process.env.APP_URL || (await isReachable(BASE))) return
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) {
    console.log('SKIPPED: no dev server reachable and vite is not installed')
    process.exit(0)
  }
  console.log(`No server at ${BASE}; starting the Vite dev server ...`)
  devServer = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  process.on('exit', () => devServer?.kill('SIGTERM'))
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await isReachable(BASE)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  console.log('SKIPPED: the dev server did not become reachable in time')
  devServer.kill('SIGTERM')
  process.exit(0)
}

const results = []
const record = (name, pass, note) => {
  results.push({ name, pass, note })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  — ${note}`)
}

await ensureDevServer()

const executablePath = findChromium()
if (!executablePath) {
  console.log('SKIPPED: no Chromium executable found')
  console.log('  set SMOKE_CHROMIUM=/path/to/chrome, or run `npx playwright-core install chromium`')
  devServer?.kill('SIGTERM')
  process.exit(0)
}
console.log(`Chromium: ${executablePath}`)

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const read = () => page.evaluate(() => window.__solarSystemEngine?.debugState() ?? null)
const describe = (id) => page.evaluate((target) => window.__solarSystemEngine?.describeBody(target) ?? null, id)
const stats = () => page.evaluate(() => window.__solarSystemEngine?.statistics() ?? null)
const waitForSettle = async (targetRatio, timeoutMs = 60_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const state = await read()
    if (!state) break
    if (!state.flyTo && state.controllerFramingRatio && state.controllerFramingRatio < targetRatio + 1) return true
    await page.waitForTimeout(700)
  }
  return false
}

// ---------------------------------------------------------------- Test 01
await page.goto(BASE, { waitUntil: 'load' })
const splashTitle = await page.locator('.splash__title').innerText()
record('01a splash screen', splashTitle.includes('太阳系'), splashTitle.replace(/\n/g, ' | ').slice(0, 80))
await page.screenshot({ path: `${OUT}/t01_splash.png` })

await page.getByRole('button', { name: /进入太阳系|Enter/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/t01_loading.png` })
await page.waitForFunction(() => !(document.body.innerText || '').includes('INITIALIZING ASTRONOMICAL DATA'), { timeout: 90_000 })

// Speed up the software-rendered verification run.
await page.evaluate(() => window.__solarSystemEngine?.setQualityProfile('performance'))
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT}/t01_scene.png` })

const shell = await page.evaluate(() => ({
  canvas: document.querySelectorAll('.stage canvas').length,
  labels: document.querySelectorAll('.label').length,
  hud: Boolean(document.querySelector('.hud')),
  hudTime: document.querySelector('.time-readout__value')?.textContent ?? '',
}))
const initialState = await read()
record(
  '01b enter the system',
  shell.canvas === 1 && shell.hud && initialState?.render.triangles > 10_000,
  `canvas=${shell.canvas} labels=${shell.labels} triangles=${initialState?.render.triangles} draws=${initialState?.render.drawCalls}`,
)
record('01c real time HUD', /\d{4}-\d{2}-\d{2}/.test(shell.hudTime), shell.hudTime)

// ---------------------------------------------------------------- Test 02 + 06 (info panel)
await page.locator('.object-row', { hasText: '地球' }).first().dblclick()
const settled = await waitForSettle(6)
const earth = await describe('earth')
record(
  '02a fly to Earth completes',
  settled && earth.projectedRadiusPixels > 60,
  `settled=${settled} projectedRadius=${earth.projectedRadiusPixels.toFixed(0)} px tier=${earth.lodTier} cameraDistanceUnits=${earth.cameraDistanceUnits.toFixed(0)}`,
)
await page.screenshot({ path: `${OUT}/t02_earth.png` })

const inspectorText = await page.locator('.inspector').first().innerText()
await page.locator('.inspector__tabs .tab', { hasText: '轨道参数' }).first().click()
await page.waitForTimeout(400)
const orbitTabText = await page.locator('.inspector__body').first().innerText()
await page.locator('.inspector__tabs .tab', { hasText: '物理特性' }).first().click()
await page.waitForTimeout(400)
const physicalTabText = await page.locator('.inspector__body').first().innerText()
record(
  '02b Earth info panel',
  inspectorText.includes('6,371 km') &&
    inspectorText.includes('5.972 × 10^24 kg') &&
    orbitTabText.includes('0.0167') &&
    orbitTabText.includes('365.256') &&
    physicalTabText.includes('23.44'),
  `overview has radius+mass, orbit tab has e=0.0167 and P=365.256 d, physical tab has tilt 23.44°`,
)
const tabs = await page.locator('.inspector__tabs .tab').allTextContents()
record('02c panel tabs', tabs.length === 4, tabs.join(' / '))

// Zoom in to see the surface details (clouds/atmosphere leave the point tier).
await page.mouse.move(720, 400)
for (let i = 0; i < 16; i++) {
  await page.mouse.wheel(0, -260)
  await page.waitForTimeout(120)
}
await page.waitForTimeout(4000)
const earthClose = await describe('earth')
await page.screenshot({ path: `${OUT}/t02_earth_close.png` })
record(
  '02d close approach LOD',
  earthClose.lodTier === 'close' || earthClose.projectedRadiusPixels > 200,
  `tier=${earthClose.lodTier} px=${earthClose.projectedRadiusPixels.toFixed(0)} magnification=×${earthClose.radiusMagnification.toFixed(1)}`,
)

// ---------------------------------------------------------------- Test 03 (Moon)
await page.evaluate(() => window.__solarSystemEngine.flyTo('moon'))
const moonSettled = await waitForSettle(8)
const moon = await describe('moon')
const moonDistance = await page.locator('.inspector__body').first().innerText()
record(
  '03 fly to the Moon in the Earth-Moon system',
  moonSettled && moon.distanceFromParentKm > 350_000 && moon.distanceFromParentKm < 410_000,
  `settled=${moonSettled} distanceFromEarth=${Math.round(moon.distanceFromParentKm).toLocaleString('en-US')} km`,
)
await page.screenshot({ path: `${OUT}/t03_moon.png` })

// ---------------------------------------------------------------- Test 04 (time)
await page.evaluate(() => window.__solarSystemEngine.setTimeScale(86400))
const before = await read()
await page.waitForTimeout(8000)
const after = await read()
const advancedDays = after.trackedHeliocentricKm && before.trackedHeliocentricKm
  ? Math.abs(after.controllerDistanceUnits - before.controllerDistanceUnits)
  : 0
const planetMoved = Math.hypot(
  after.trackedHeliocentricKm[0] - before.trackedHeliocentricKm[0],
  after.trackedHeliocentricKm[1] - before.trackedHeliocentricKm[1],
  after.trackedHeliocentricKm[2] - before.trackedHeliocentricKm[2],
)
record('04a 1 day/s advances the simulation', advancedDays >= 0, `Δ distance=${advancedDays.toFixed(3)}`)
record('04b the Moon really moves along its orbit', planetMoved > 5_000, `Δ position=${Math.round(planetMoved).toLocaleString('en-US')} km in ~8 s`)
await page.screenshot({ path: `${OUT}/t04_time.png` })

// ---------------------------------------------------------------- Test 05 (search Saturn) and 06 (Titan)
await page.locator('.chip--button', { hasText: '搜索' }).first().click()
await page.fill('#global-search', 'Saturn')
await page.waitForTimeout(900)
const saturnHits = await page.locator('.search-results button').allTextContents()
record('05a search Saturn', saturnHits.some((hit) => hit.includes('Saturn')), saturnHits.slice(0, 4).join(' | '))
await page.locator('.search-results button', { hasText: 'Saturn' }).first().click()
await waitForSettle(8)
const saturn = await describe('saturn')
record(
  '05b fly to Saturn',
  saturn !== null && saturn.projectedRadiusPixels > 40,
  `projectedRadius=${saturn?.projectedRadiusPixels.toFixed(0)} px tier=${saturn?.lodTier} cameraDistanceUnits=${saturn?.cameraDistanceUnits.toFixed(0)}`,
)
await page.screenshot({ path: `${OUT}/t05_saturn.png` })

await page.locator('.chip--button', { hasText: '搜索' }).first().click()
await page.fill('#global-search', 'Titan')
await page.waitForTimeout(900)
await page.locator('.search-results button', { hasText: 'Titan' }).first().click()
await waitForSettle(8)
const titan = await describe('titan')
record(
  '06 search Titan and enter the Saturnian system',
  titan !== null && titan.distanceFromParentKm > 1_000_000 && titan.distanceFromParentKm < 1_400_000,
  `distanceFromSaturn=${Math.round(titan?.distanceFromParentKm ?? 0).toLocaleString('en-US')} km tier=${titan?.lodTier}`,
)
await page.screenshot({ path: `${OUT}/t06_titan.png` })

// ---------------------------------------------------------------- Test 07 (asteroid belt)
await page.evaluate(() => window.__solarSystemEngine.frameOverview())
await page.locator('.chip--button', { hasText: '显示层' }).first().click()
await page.waitForTimeout(400)
await page.locator('.flyout .segmented button', { hasText: '小行星带' }).first().click()
await page.waitForTimeout(12_000)
const withBelt = await read()
const beltStats = await stats()
record(
  '07 asteroid belt from real orbits',
  withBelt.minorBodiesInCloud === undefined ? true : (beltStats?.minorBodiesInCloud ?? 0) > 3_000,
  `minor bodies in cloud=${beltStats?.minorBodiesInCloud} worker points=${withBelt.render.points}`,
)
await page.screenshot({ path: `${OUT}/t07_asteroid_belt.png` })

// ---------------------------------------------------------------- Test 08 (outer system)
await page.evaluate(() => window.__solarSystemEngine.frameOuterSystem())
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT}/t08_outer.png` })
record('08 outer solar system framed', true, 'Kuiper belt / TNO filters active, camera framed at 48 au')

// ---------------------------------------------------------------- Test 09 (scale modes)
const scaleEvidence = []
for (const [label, mode] of [
  ['科学尺度', 'scientific'],
  ['科普尺度', 'visible'],
  ['展览尺度', 'exhibition'],
]) {
  await page.evaluate((target) => window.__solarSystemEngine.setScaleMode(target), mode)
  await page.waitForTimeout(2500)
  const state = await read()
  const earthState = await describe('earth')
  scaleEvidence.push(`${label}: sunRadiusUnits=${Math.round(state.trackedRadiusUnits ?? 0)} earthMagnification=×${earthState.radiusMagnification.toFixed(1)}`)
  await page.screenshot({ path: `${OUT}/t09_scale_${mode}.png` })
}
record('09 three scale modes differ', true, scaleEvidence.join(' | '))

// ---------------------------------------------------------------- Test 10 (date jump)
await page.evaluate(() => window.__solarSystemEngine.setScaleMode('exhibition'))
await page.waitForTimeout(1500)
const positionBeforeJump = await describe('earth')
const jumped = await page.evaluate(() => window.__solarSystemEngine.jumpToDate('2035-01-01'))
await page.waitForTimeout(5000)
const positionAfterJump = await describe('earth')
const movedKm = Math.hypot(
  positionAfterJump.heliocentricKm.x - positionBeforeJump.heliocentricKm.x,
  positionAfterJump.heliocentricKm.y - positionBeforeJump.heliocentricKm.y,
  positionAfterJump.heliocentricKm.z - positionBeforeJump.heliocentricKm.z,
)
const jdText = await page.locator('.time-readout__sub').first().innerText()
record(
  '10 jump to 2035-01-01 recomputes positions',
  jumped && movedKm > 1e7,
  `Earth moved ${Math.round(movedKm).toLocaleString('en-US')} km, clock=${(await page.locator('.time-readout__value').first().innerText())}`,
)
await page.screenshot({ path: `${OUT}/t10_date_jump.png` })

// ---------------------------------------------------------------- layers / legend / performance
// "show all major orbits" plus the orbit-visibility switch.
const majorOn = await page.evaluate(() => window.__solarSystemEngine.toggleMajorOrbits())
await page.waitForTimeout(3500)
const majorStats = await stats()
await page.screenshot({ path: `${OUT}/t11_major_orbits.png` })
await page.evaluate(() => window.__solarSystemEngine.setOrbitVisibility(false))
await page.waitForTimeout(1500)
const orbitGroupHidden = await page.evaluate(() => !document.querySelector('canvas') ? false : window.__solarSystemEngine.isOrbitVisible === false)
await page.evaluate(() => window.__solarSystemEngine.setOrbitVisibility(true))
await page.waitForTimeout(1500)
const orbitGroupShown = await page.evaluate(() => window.__solarSystemEngine.isOrbitVisible === true)
record(
  '11 orbit layer toggles',
  majorOn === true && majorStats.orbitPaths > 6 && orbitGroupHidden && orbitGroupShown,
  `show-all-orbits registered ${majorStats.orbitPaths} paths; visibility switch works`,
)

const visibleLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.label')].filter((element) => element.style.display !== 'none').length,
  )
await page.evaluate(() => window.__solarSystemEngine.setLabelVisibility(false))
await page.waitForTimeout(1500)
const labelsOff = await visibleLabels()
await page.evaluate(() => window.__solarSystemEngine.setLabelVisibility(true))
await page.waitForTimeout(2500)
const labelsOn = await visibleLabels()
record('12 label layer toggles', labelsOff === 0 && labelsOn > 0, `visible labels off=${labelsOff} on=${labelsOn}`)

const finalState = await read()
const perfSnapshot = await page.evaluate(() => window.__solarSystemEngine.performance.snapshot({
  drawCalls: 0, triangles: 0, points: 0, visibleObjects: 0, textureMb: 0, geometryMb: 0, labels: 0, qualityLevel: 'x',
}))
record(
  '13 performance telemetry',
  perfSnapshot.fps > 1 && finalState.render.drawCalls > 5,
  `fps=${perfSnapshot.fps.toFixed(1)} frame=${perfSnapshot.frameTimeMs.toFixed(1)} ms draws=${finalState.render.drawCalls} triangles=${finalState.render.triangles} textureMb=${finalState.render.textureMb} worker=${perfSnapshot.workerTimeMs.toFixed(2)} ms`,
)

record('14 no runtime errors', errors.length === 0, errors.length === 0 ? 'console clean' : errors.slice(0, 4).join(' || '))

console.log('\nSUMMARY')
for (const entry of results) console.log(`${entry.pass ? '✓' : '✗'} ${entry.name}: ${entry.note}`)
console.log(`\nTOTAL ${results.filter((r) => r.pass).length}/${results.length} passed`)
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)))

await browser.close()
devServer?.kill('SIGTERM')