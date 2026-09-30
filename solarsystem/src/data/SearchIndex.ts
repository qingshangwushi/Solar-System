/**
 * Search index.
 *
 * A MiniSearch index is built once from the rendered bodies plus the ~11 000
 * minor-body records, so a query never walks the catalog linearly. Fields cover
 * the name, the official designation, the survey designation, the IAU number and
 * the aliases, which is what visitors actually type ("Halley", "67P", "Eris",
 * "2003 UB313", "Apophis").
 */
import MiniSearch, { type SearchResult } from 'minisearch'
import type { CelestialBody, MinorBodyRecord } from '../types/catalog'
import { MinorBodyStore } from './MinorBodyStore'

export type SearchHitKind = 'body' | 'minorBody'

export interface SearchHit {
  id: string
  kind: SearchHitKind
  name: string
  nameZh: string | null
  typeLabel: string
  /** Owning system, English name (§24). Null for objects with no parent. */
  parentLabel: string | null
  /** Owning system, Chinese name when the catalogue publishes one. */
  parentNameZh: string | null
  /** Catalogue number, when the object has one. */
  number: string | null
  designation: string
  score: number
}

interface IndexDocument {
  id: string
  kind: SearchHitKind
  name: string
  nameZh: string
  designation: string
  aliases: string
  typeLabel: string
  parentLabel: string
  parentNameZh: string
  number: string
}

/** Bucket -> human label, translated at render time via the i18n dictionary. */
const BUCKET_LABELS: Record<string, string> = {
  mainBelt: 'mainBelt',
  nearEarth: 'nearEarth',
  trojan: 'trojan',
  centaur: 'centaur',
  tno: 'tno',
  comet: 'comet',
}

/**
 * Chinese designations for the small bodies whose names have an established
 * Chinese form. The source catalogue is English-only, so without this table a
 * Chinese query could never match a small body (P2: "小天体无 nameZh").
 * Values follow the standard Chinese planetary nomenclature for these objects.
 */
const MINOR_BODY_NAME_ZH: Record<string, string> = {
  '1': '谷神星',
  '134340': '冥王星',
  '136108': '妊神星',
  '136472': '鸟神星',
  '136199': '阅神星',
  '1P': '哈雷彗星',
  '2P': '恩克彗星',
}

export class CatalogSearchIndex {
  private readonly index: MiniSearch<IndexDocument>
  private readonly documents = new Map<string, IndexDocument>()
  private readonly parentNames = new Map<string, string>()

  constructor(bodies: CelestialBody[], minorBodies: MinorBodyStore | null) {
    this.index = new MiniSearch<IndexDocument>({
      fields: ['name', 'nameZh', 'designation', 'aliases'],
      storeFields: ['kind', 'name', 'nameZh', 'designation', 'typeLabel', 'parentLabel', 'parentNameZh', 'number'],
      searchOptions: {
        boost: { name: 3, nameZh: 2.5, designation: 2, aliases: 1.5 },
        prefix: true,
        fuzzy: 0.2,
        combineWith: 'AND',
      },
    })

    const documents: IndexDocument[] = []
    const byId = new Map(bodies.map((body) => [body.id, body]))
    for (const body of bodies) {
      const parent = body.parentId ? byId.get(body.parentId) : undefined
      this.parentNames.set(body.id, parent?.name ?? '')
      documents.push({
        id: `body:${body.id}`,
        kind: 'body',
        name: body.name,
        nameZh: body.nameZh ?? '',
        designation: [body.officialName, ...(body.aliases ?? [])].filter(Boolean).join(' '),
        aliases: (body.aliases ?? []).join(' '),
        typeLabel: body.type,
        parentLabel: parent?.name ?? '',
        parentNameZh: parent?.nameZh ?? '',
        number: '',
      })
    }

    if (minorBodies) {
      for (const record of minorBodies.records) {
        documents.push(minorBodyDocument(record))
      }
    }

    this.index.addAll(documents)
    for (const document of documents) this.documents.set(document.id, document)
  }

  get size(): number {
    return this.documents.size
  }

  search(query: string, limit = 24): SearchHit[] {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const results: SearchResult[] = this.index.search(trimmed, { prefix: true, fuzzy: 0.2 })
    return results.slice(0, limit).map((result) => {
      const document = this.documents.get(String(result.id))
      const [kind, rawId] = String(result.id).split(':')
      return {
        id: rawId,
        kind: kind as SearchHitKind,
        name: document?.name ?? String(result.id),
        nameZh: document?.nameZh ? document.nameZh : null,
        typeLabel: document?.typeLabel ?? '',
        parentLabel: document?.parentLabel ?? null,
        parentNameZh: document?.parentNameZh ? document.parentNameZh : null,
        number: document?.number ? document.number : null,
        designation: document?.designation ?? '',
        score: result.score,
      }
    })
  }

  /** Suggestions used by the "did you mean" hint in the search panel. */
  autoSuggest(query: string, limit = 6): string[] {
    return this.index.autoSuggest(query, { prefix: true }).slice(0, limit).map((entry) => entry.suggestion)
  }
}

function minorBodyDocument(record: MinorBodyRecord): IndexDocument {
  // Numbered objects carry their catalogue number as the record id ("136199",
  // "1"); comet designations like "1P" are not numbers.
  const number = /^[0-9]+$/.test(record.id) ? record.id : record.number ?? ''
  const nameZh = record.nameZh ?? MINOR_BODY_NAME_ZH[record.id] ?? ''
  return {
    id: `minorBody:${record.id}`,
    kind: 'minorBody',
    name: record.name,
    nameZh,
    designation: [number, record.id, record.fullName, record.classCode].filter(Boolean).join(' '),
    aliases: record.fullName,
    typeLabel: BUCKET_LABELS[record.bucket] ?? record.bucket,
    // A small body has no parent system of its own; the dynamical class is shown
    // separately, so `parentLabel` stays empty for the search row.
    parentLabel: '',
    parentNameZh: '',
    number,
  }
}