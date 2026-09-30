/**
 * Global search tests (specification §24/§49).
 *
 * The search panel itself is React; the behaviour that decides whether a visitor
 * finds a body is `CatalogSearchIndex`, so that is what is asserted here against the
 * real generated catalog and the real minor-body binary — no fixtures, the same
 * documents the running exhibition indexes. The suite needs no DOM and runs in the
 * default Node environment.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CatalogSearchIndex } from '../../data/SearchIndex'
import { MinorBodyStore } from '../../data/MinorBodyStore'
import type { CatalogManifest, MinorBodyIndex, SolarSystemCatalog } from '../../types/catalog'

const catalogDir = resolve(process.cwd(), 'public/data/catalog')
const manifest = JSON.parse(readFileSync(resolve(catalogDir, 'manifest.json'), 'utf8')) as CatalogManifest
// Read the artefact the manifest names, so this test also guards the §6/§48
// versioned-catalog contract that src/data/CatalogLoader.ts depends on.
const catalog = JSON.parse(readFileSync(resolve(catalogDir, manifest.catalogFile!), 'utf8')) as SolarSystemCatalog
const minorBodyIndex = JSON.parse(readFileSync(resolve(catalogDir, 'minor-bodies.json'), 'utf8')) as MinorBodyIndex
const buffer = readFileSync(resolve(catalogDir, 'minor-bodies.bin'))
const elements = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
const minorBodies = new MinorBodyStore(minorBodyIndex, elements)
const search = new CatalogSearchIndex(catalog.bodies, minorBodies)

/** Result ids, in ranked order — convenient for `toContain` assertions. */
const ids = (query: string): string[] => search.search(query).map((hit) => hit.id)
const hitById = (query: string, id: string) => search.search(query).find((hit) => hit.id === id)

describe('catalog search index', () => {
  it('indexes every rendered body and every minor body', () => {
    expect(search.size).toBe(catalog.bodies.length + minorBodies.length)
  })

  it('names a versioned catalog artefact in the manifest', () => {
    expect(manifest.catalogFile).toMatch(/^catalog-v\d{8}\.json$/)
  })

  it('finds a body by its Chinese name', () => {
    expect(hitById('地球', 'earth')?.nameZh).toBe('地球')
    expect(ids('木星')).toContain('jupiter')
    expect(ids('太阳')).toContain('sun')
  })

  it('finds a body by its official name', () => {
    expect(ids('Earth')).toContain('earth')
    expect(ids('1 Ceres')).toContain('ceres')
    expect(hitById('1 Ceres', 'ceres')?.designation).toContain('1 Ceres')
  })

  it('finds a body by its IAU number', () => {
    // 136199 is the numbered designation of Eris, carried as an alias/official name.
    expect(ids('136199')).toContain('eris')
    expect(ids('136199')).toContain('136199')
  })

  it('finds a body by an alias', () => {
    expect(ids('Terra')).toContain('earth')
    expect(ids('Sol')).toContain('sun')
  })

  it('finds a minor body by its survey designation', () => {
    // 2003 UB313 is the discovery designation inside the SBDB `fullName`.
    expect(ids('2003 UB313')).toContain('136199')
    expect(ids('Halley')).toContain('1P')
  })

  it('exposes the catalogue number and the localized owning system', () => {
    // The hit carries both the numeric designation and the owning system in the
    // active language, which is what the search row renders (§24).
    expect(hitById('136199', '136199')?.number).toBe('136199')
    const earth = hitById('Earth', 'earth')
    expect(earth?.parentNameZh).toBe('太阳')
    expect(earth?.number).toBeNull()
  })

  it('returns nothing for an empty query', () => {
    expect(search.search('')).toEqual([])
    expect(search.search('   ')).toEqual([])
  })

  it('offers suggestions for a partial name', () => {
    const suggestions = search.autoSuggest('Jup')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.join(' ')).toMatch(/Jup/i)
  })

  it('prints the index size so the coverage is visible in the test output', () => {
    console.log(
      `\nSearch index: ${catalog.bodies.length} rendered bodies + ${minorBodies.length} minor bodies = ${search.size} documents`,
    )
    expect(search.size).toBeGreaterThan(10_000)
  })
})
