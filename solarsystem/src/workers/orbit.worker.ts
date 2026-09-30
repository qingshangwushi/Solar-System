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

import { propagateMinorBodyKm, sampleMinorBodyOrbitKm } from '../astronomy/MinorBodyPropagator'

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
    const position = propagateMinorBodyKm(array, subset[slot], message.julianDate, gm)
    if (!position) continue
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
  const points = sampleMinorBodyOrbitKm(elements, message.index, message.samples)
  if (!points) return
  const buffer = points.buffer
  scope.postMessage(
    { type: 'orbitPath', requestId: message.requestId, index: message.index, positions: buffer, computeMs: performance.now() - started },
    [buffer],
  )
}