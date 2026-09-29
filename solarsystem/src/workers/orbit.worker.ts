/**
 * Orbit worker.
 *
 * All Kepler propagation for the minor-body cloud happens here, off the main
 * thread. The worker owns the element buffer, the render subset and the per-object
 * scratch state, and only ever transfers a flat Float64Array of positions, so the
 * main thread never allocates one object per asteroid and never blocks on 11 000
 * Kepler solves.
 *
 * Protocol (see OrbitWorkerClient for the typed wrapper):
 *   init       { elements, subset, gmKm3S2 }
 *   setSubset  { subset }
 *   update     { requestId, julianDate }
 *   orbitPath  { requestId, index, samples }
 *   dispose    {}
 */
/// <reference lib="webworker" />

import { perifocalPositionFromMeanAnomaly, perifocalToReferenceFrame } from '../astronomy/KeplerSolver'
import { AU_KM } from '../astronomy/Units'

const STRIDE = 8
const SECONDS_PER_DAY = 86_400
const MJD_TO_JD = 2_400_000.5

const scope = self as unknown as DedicatedWorkerGlobalScope

interface InitMessage {
  type: 'init'
  elements: ArrayBuffer
  subset: ArrayBuffer
  gmKm3S2: number
}

interface SubsetMessage {
  type: 'setSubset'
  subset: ArrayBuffer
}

interface UpdateMessage {
  type: 'update'
  requestId: number
  julianDate: number
}

interface OrbitPathMessage {
  type: 'orbitPath'
  requestId: number
  index: number
  samples: number
}

export type OrbitWorkerIncoming = InitMessage | SubsetMessage | UpdateMessage | OrbitPathMessage | { type: 'dispose' }

let elements: Float32Array | null = null
let subset = new Int32Array(0)
let gm = 1.32712440018e11

scope.onmessage = (event: MessageEvent<OrbitWorkerIncoming>) => {
  const message = event.data
  switch (message.type) {
    case 'init':
      elements = new Float32Array(message.elements)
      subset = new Int32Array(message.subset)
      gm = message.gmKm3S2
      scope.postMessage({ type: 'ready', count: subset.length })
      break
    case 'setSubset':
      subset = new Int32Array(message.subset)
      scope.postMessage({ type: 'ready', count: subset.length })
      break
    case 'update':
      handleUpdate(message)
      break
    case 'orbitPath':
      handleOrbitPath(message)
      break
    case 'dispose':
      elements = null
      subset = new Int32Array(0)
      self.close()
      break
  }
}

function handleUpdate(message: UpdateMessage): void {
  const started = performance.now()
  if (!elements) {
    scope.postMessage({ type: 'positions', requestId: message.requestId, positions: new ArrayBuffer(0), count: 0, computeMs: 0 })
    return
  }
  const count = subset.length
  const output = new Float64Array(count * 3)
  const array = elements

  for (let slot = 0; slot < count; slot++) {
    const offset = subset[slot] * STRIDE
    const qAu = array[offset]
    const eccentricity = array[offset + 1]
    const inclination = array[offset + 2]
    const node = array[offset + 3]
    const argumentOfPeriapsis = array[offset + 4]
    const perihelionMjd = array[offset + 5]

    // a = q / (1 - e); negative for hyperbolic orbits, so one code path covers both.
    const semiMajorAxisKm = (qAu * AU_KM) / (1 - eccentricity)
    const meanMotionPerSecond = Math.sqrt(gm / Math.abs(semiMajorAxisKm) ** 3)
    const secondsSincePerihelion = (message.julianDate - (perihelionMjd + MJD_TO_JD)) * SECONDS_PER_DAY
    const meanAnomaly = meanMotionPerSecond * secondsSincePerihelion

    const plane = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, eccentricity, meanAnomaly)
    const position = perifocalToReferenceFrame(plane, {
      semiMajorAxisKm,
      eccentricity,
      inclinationRad: inclination,
      nodeRad: node,
      argumentOfPeriapsisRad: argumentOfPeriapsis,
    })
    output[slot * 3] = position.x
    output[slot * 3 + 1] = position.y
    output[slot * 3 + 2] = position.z
  }

  const buffer = output.buffer
  scope.postMessage(
    { type: 'positions', requestId: message.requestId, positions: buffer, count, computeMs: performance.now() - started },
    [buffer],
  )
}

/**
 * Samples one object's trajectory: a closed ellipse, or both hyperbola branches.
 * Used when a minor body is selected for the orbit overlay.
 */
function handleOrbitPath(message: OrbitPathMessage): void {
  const started = performance.now()
  if (!elements) return
  const offset = message.index * STRIDE
  const qAu = elements[offset]
  const eccentricity = elements[offset + 1]
  const semiMajorAxisKm = (qAu * AU_KM) / (1 - eccentricity)
  const elementsSet = {
    semiMajorAxisKm,
    eccentricity,
    inclinationRad: elements[offset + 2],
    nodeRad: elements[offset + 3],
    argumentOfPeriapsisRad: elements[offset + 4],
  }

  const samples = Math.max(32, message.samples)
  let points: Float64Array
  if (eccentricity < 1) {
    points = new Float64Array(samples * 3)
    for (let index = 0; index < samples; index++) {
      const meanAnomaly = (index / samples) * Math.PI * 2
      const plane = perifocalPositionFromMeanAnomaly(semiMajorAxisKm, eccentricity, meanAnomaly)
      const position = perifocalToReferenceFrame(plane, elementsSet)
      points[index * 3] = position.x
      points[index * 3 + 1] = position.y
      points[index * 3 + 2] = position.z
    }
  } else {
    const asymptote = Math.acos(-1 / eccentricity) * 0.96
    const periapsis = semiMajorAxisKm * (1 - eccentricity)
    points = new Float64Array(samples * 2 * 3)
    for (let index = 0; index < samples * 2; index++) {
      const sign = index < samples ? -1 : 1
      const fraction = (index % samples) / (samples - 1)
      const trueAnomaly = sign * fraction * asymptote
      const radius = (periapsis * (1 + eccentricity)) / (1 + eccentricity * Math.cos(trueAnomaly))
      const position = perifocalToReferenceFrame(
        { x: radius * Math.cos(trueAnomaly), y: radius * Math.sin(trueAnomaly) },
        elementsSet,
      )
      points[index * 3] = position.x
      points[index * 3 + 1] = position.y
      points[index * 3 + 2] = position.z
    }
  }

  const buffer = points.buffer
  scope.postMessage(
    { type: 'orbitPath', requestId: message.requestId, index: message.index, positions: buffer, computeMs: performance.now() - started },
    [buffer],
  )
}