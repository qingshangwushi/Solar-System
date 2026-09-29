/**
 * Minor-body store.
 *
 * The ~11 000 catalogued small bodies are kept as flat typed arrays rather than
 * JavaScript objects (project constraint: no Object3D/Mesh/React component per
 * object). The binary carries the orbital elements, the JSON index carries the
 * identification fields used by search and the filters.
 *
 * Binary layout (Float32, stride 8), as written by scripts/build-catalog.mjs:
 *   [0] perihelion distance q, au
 *   [1] eccentricity e
 *   [2] inclination, rad
 *   [3] longitude of the ascending node, rad
 *   [4] argument of periapsis, rad
 *   [5] perihelion passage, MJD (TDB)
 *   [6] absolute magnitude H
 *   [7] diameter, km (0 when unknown)
 */
import { AU_KM } from '../astronomy/Units'
import type { MinorBodyIndex, MinorBodyRecord } from '../types/catalog'
import { dataUrl } from './ConfigLoader'

export const MINOR_BODY_STRIDE = 8

export interface MinorBodySelection {
  buckets?: ReadonlySet<string>
  onlyNotable?: boolean
  onlyNeo?: boolean
  onlyPha?: boolean
  maxAbsoluteMagnitude?: number
}

export class MinorBodyStore {
  readonly records: MinorBodyRecord[]
  readonly elements: Float32Array
  readonly stride = MINOR_BODY_STRIDE
  readonly counts: MinorBodyIndex['counts']
  readonly source: string

  private readonly idToIndex = new Map<string, number>()

  constructor(index: MinorBodyIndex, elements: Float32Array) {
    if (elements.length !== index.objects.length * MINOR_BODY_STRIDE) {
      throw new Error(
        `minor-body element buffer has ${elements.length} floats but ${index.objects.length} objects x ${MINOR_BODY_STRIDE} were expected`,
      )
    }
    this.records = index.objects
    this.elements = elements
    this.counts = index.counts
    this.source = index.source
    for (let position = 0; position < this.records.length; position++) {
      this.idToIndex.set(this.records[position].id, position)
    }
  }

  get length(): number {
    return this.records.length
  }

  indexOf(id: string): number {
    const index = this.idToIndex.get(id)
    return index === undefined ? -1 : index
  }

  recordAt(index: number): MinorBodyRecord | undefined {
    return this.records[index]
  }

  /** Semi-major axis in au, derived from q and e (negative for hyperbolic orbits). */
  semiMajorAxisAuAt(index: number): number {
    const offset = index * this.stride
    const q = this.elements[offset]
    const e = this.elements[offset + 1]
    return q / (1 - e)
  }

  perihelionDistanceKmAt(index: number): number {
    return this.elements[index * this.stride] * AU_KM
  }

  eccentricityAt(index: number): number {
    return this.elements[index * this.stride + 1]
  }

  perihelionMjdAt(index: number): number {
    return this.elements[index * this.stride + 5]
  }

  absoluteMagnitudeAt(index: number): number {
    return this.elements[index * this.stride + 6]
  }

  diameterKmAt(index: number): number {
    return this.elements[index * this.stride + 7]
  }

  /** Indices matching a filter, used to build the render subset. */
  selectIndices(selection: MinorBodySelection): Int32Array {
    const selected: number[] = []
    for (let index = 0; index < this.records.length; index++) {
      const record = this.records[index]
      if (selection.buckets && !selection.buckets.has(record.bucket)) continue
      if (selection.onlyNotable && !record.notable) continue
      if (selection.onlyNeo && !record.isNeo) continue
      if (selection.onlyPha && !record.isPha) continue
      if (
        selection.maxAbsoluteMagnitude !== undefined &&
        (record.absoluteMagnitude === null || record.absoluteMagnitude > selection.maxAbsoluteMagnitude)
      ) {
        continue
      }
      selected.push(index)
    }
    return Int32Array.from(selected)
  }
}

export interface MinorBodyLoadProgress {
  stage: string
  loaded: number
  total: number
}

export async function loadMinorBodies(
  indexUrl: string,
  binaryUrl: string,
  onProgress?: (progress: MinorBodyLoadProgress) => void,
): Promise<MinorBodyStore> {
  onProgress?.({ stage: 'minorBodies', loaded: 0, total: 2 })
  const [indexResponse, binaryResponse] = await Promise.all([
    fetch(dataUrl(indexUrl)),
    fetch(dataUrl(binaryUrl)),
  ])
  if (!indexResponse.ok) throw new Error(`minor-body index: HTTP ${indexResponse.status}`)
  if (!binaryResponse.ok) throw new Error(`minor-body elements: HTTP ${binaryResponse.status}`)
  onProgress?.({ stage: 'minorBodies', loaded: 1, total: 2 })

  const index = (await indexResponse.json()) as MinorBodyIndex
  const buffer = await binaryResponse.arrayBuffer()
  onProgress?.({ stage: 'minorBodies', loaded: 2, total: 2 })

  const elements = new Float32Array(buffer)
  return new MinorBodyStore(index, elements)
}