/**
 * Performance baseline for the Kepler propagation pass (specification §59).
 *
 * The report notes that §59 asks for 1 000 / 10 000 / 100 000 / 500 000 object
 * scales while the offline catalogue holds ~11 000. The catalogue cannot be inflated
 * with invented bodies, so the pass is measured over *synthetic element arrays* that
 * use the production Float32 layout and physically valid elements; only the
 * population is synthetic, never a position. Two passes are timed:
 *
 *  - the production path  : MinorBodyPropagator.propagateMinorBodyKm per object;
 *  - the primitive path   : KeplerSolver.perifocalPositionFromMeanAnomaly +
 *                           perifocalToReferenceFrame per object.
 *
 * Ceilings are deliberately generous (an order of magnitude above the measured
 * values on the development machine) so the test guards against a complexity
 * regression — e.g. an accidental O(n²) — without being flaky on slower CI hosts.
 * Measured throughput is printed so the numbers are visible in the test output.
 */
import { describe, expect, it } from 'vitest'
import { perifocalPositionFromMeanAnomaly, perifocalToReferenceFrame } from '../KeplerSolver'
import { MINOR_BODY_STRIDE, MJD_TO_JD, propagateMinorBodyKm } from '../MinorBodyPropagator'
import { AU_KM, SECONDS_PER_DAY } from '../Units'
import { GM_SUN_KM3_S2 } from '../Constants'

const SCALES = [1_000, 10_000, 100_000, 500_000]

/** Per-object wall-clock ceiling, nanoseconds (25 µs — a ~100x margin). */
const MAX_NS_PER_OBJECT = 25_000
/** Total wall-clock ceiling per scale, milliseconds. */
const MAX_TOTAL_MS: Record<number, number> = {
  1_000: 250,
  10_000: 400,
  100_000: 1_500,
  500_000: 6_000,
}

const JD = 2_461_312.5

/**
 * Deterministic synthetic population in the documented stride-8 layout:
 * q[au], e, i[rad], node[rad], argPeri[rad], perihelionMjd, H, diameter[km].
 */
function syntheticElements(count: number): Float32Array {
  const elements = new Float32Array(count * MINOR_BODY_STRIDE)
  for (let index = 0; index < count; index++) {
    const offset = index * MINOR_BODY_STRIDE
    const seed = index + 1
    elements[offset] = 1.8 + ((seed * 7) % 1_000) / 1_000 * 1.6
    elements[offset + 1] = 0.02 + ((seed * 13) % 1_000) / 1_000 * 0.3
    elements[offset + 2] = (((seed * 17) % 360) * Math.PI) / 180
    elements[offset + 3] = (((seed * 29) % 360) * Math.PI) / 180
    elements[offset + 4] = (((seed * 41) % 360) * Math.PI) / 180
    elements[offset + 5] = 58_000 + ((seed * 53) % 2_000)
    elements[offset + 6] = 12
    elements[offset + 7] = 5
  }
  return elements
}

/** The production propagation path. Returns a checksum so the work cannot be elided. */
function passViaPropagator(elements: Float32Array, count: number): number {
  let checksum = 0
  for (let index = 0; index < count; index++) {
    const position = propagateMinorBodyKm(elements, index, JD)
    if (position) checksum += position.x + position.y + position.z
  }
  return checksum
}

/** The primitive path, spelled out with the two public KeplerSolver functions. */
function passViaKeplerSolver(elements: Float32Array, count: number): number {
  let checksum = 0
  for (let index = 0; index < count; index++) {
    const offset = index * MINOR_BODY_STRIDE
    const qAu = elements[offset]
    const eccentricity = elements[offset + 1]
    const semiMajorAxisKm = (qAu * AU_KM) / (1 - eccentricity)
    const meanMotionPerSecond = Math.sqrt(GM_SUN_KM3_S2 / Math.abs(semiMajorAxisKm) ** 3)
    const perihelionJD = elements[offset + 5] + MJD_TO_JD
    const meanAnomaly = meanMotionPerSecond * (JD - perihelionJD) * SECONDS_PER_DAY
    const plane = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, eccentricity, meanAnomaly)
    const position = perifocalToReferenceFrame(plane, {
      semiMajorAxisKm,
      eccentricity,
      inclinationRad: elements[offset + 2],
      nodeRad: elements[offset + 3],
      argumentOfPeriapsisRad: elements[offset + 4],
    })
    checksum += position.x + position.y + position.z
  }
  return checksum
}

function measure(pass: () => void): number {
  const started = performance.now()
  pass()
  return performance.now() - started
}

describe('Kepler propagation performance', () => {
  it('keeps the primitive and production paths numerically identical', () => {
    const elements = syntheticElements(2_000)
    const production = propagateMinorBodyKm(elements, 1, JD)!
    const offset = MINOR_BODY_STRIDE
    const qAu = elements[offset]
    const eccentricity = elements[offset + 1]
    const semiMajorAxisKm = (qAu * AU_KM) / (1 - eccentricity)
    const meanAnomaly =
      Math.sqrt(GM_SUN_KM3_S2 / Math.abs(semiMajorAxisKm) ** 3) *
      (JD - (elements[offset + 5] + MJD_TO_JD)) *
      SECONDS_PER_DAY
    const primitive = perifocalToReferenceFrame(
      perifocalPositionFromMeanAnomaly(semiMajorAxisKm, eccentricity, meanAnomaly),
      {
        semiMajorAxisKm,
        eccentricity,
        inclinationRad: elements[offset + 2],
        nodeRad: elements[offset + 3],
        argumentOfPeriapsisRad: elements[offset + 4],
      },
    )
    expect(primitive.x).toBeCloseTo(production.x, 6)
    expect(primitive.y).toBeCloseTo(production.y, 6)
    expect(primitive.z).toBeCloseTo(production.z, 6)
  })

  it('propagates 1k / 10k / 100k / 500k objects inside the documented ceilings', () => {
    const report: string[] = []
    for (const count of SCALES) {
      const elements = syntheticElements(count)

      const productionMs = measure(() => {
        passViaPropagator(elements, count)
      })
      const primitiveMs = measure(() => {
        passViaKeplerSolver(elements, count)
      })

      const productionNsPerObject = (productionMs * 1e6) / count
      const primitiveNsPerObject = (primitiveMs * 1e6) / count
      const throughput = count / (productionMs / 1_000)

      report.push(
        `${count.toLocaleString('en-US').padStart(9)} objects: production ${productionMs.toFixed(1).padStart(8)} ms ` +
          `(${productionNsPerObject.toFixed(0).padStart(5)} ns/object, ${Math.round(throughput).toLocaleString('en-US').padStart(11)} objects/s); ` +
          `primitive ${primitiveMs.toFixed(1).padStart(8)} ms (${primitiveNsPerObject.toFixed(0).padStart(5)} ns/object)`,
      )

      expect(productionMs, `propagateMinorBodyKm total at ${count}`).toBeLessThan(MAX_TOTAL_MS[count])
      expect(primitiveMs, `KeplerSolver total at ${count}`).toBeLessThan(MAX_TOTAL_MS[count])
      expect(productionNsPerObject, `per-object cost at ${count}`).toBeLessThan(MAX_NS_PER_OBJECT)
      expect(primitiveNsPerObject, `per-object cost at ${count}`).toBeLessThan(MAX_NS_PER_OBJECT)
      expect(Number.isFinite(productionMs)).toBe(true)
    }
    console.log(`\nKepler propagation throughput (JD ${JD}, ${SCALES.length} scales)\n${report.join('\n')}`)
  })
})
