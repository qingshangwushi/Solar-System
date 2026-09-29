/**
 * Catalog browser (left panel).
 *
 * The tree mirrors the astronomical hierarchy that the catalog encodes:
 * star -> planets -> their moons, then the dwarf planets grouped separately.
 * The last tab lists the minor bodies most likely to be searched for (the notable
 * comets and the largest numbered asteroids) instead of dumping 11 000 rows into
 * the DOM.
 */
import { useMemo, useState } from 'react'
import type { CelestialBody } from '../types/catalog'
import type { Translate } from '../i18n'
import { typeColour, typeKey } from './formatters'
import type { MinorBodyStore } from '../data/MinorBodyStore'
import type { LoadedCatalog } from '../data/CatalogLoader'

type Tab = 'major' | 'moons' | 'minor'

export interface SidebarProps {
  t: Translate
  language: 'zh-CN' | 'en-US'
  catalog: LoadedCatalog | null
  selectedId: string | null
  selectedMinorIndex: number | null
  onSelect: (id: string) => void
  onFlyTo: (id: string) => void
  onSelectMinor: (index: number) => void
  onClose: () => void
}

export function Sidebar(props: SidebarProps) {
  const { t, language, catalog } = props
  const [tab, setTab] = useState<Tab>('major')

  const byParent = useMemo(() => {
    const map = new Map<string, CelestialBody[]>()
    if (!catalog) return map
    for (const body of catalog.bodies) {
      if (!body.parentId) continue
      const list = map.get(body.parentId) ?? []
      list.push(body)
      map.set(body.parentId, list)
    }
    // Moons are listed in orbital order, which is how planetary satellite
    // catalogues are conventionally presented.
    for (const list of map.values()) {
      list.sort((a, b) => (a.orbitSummary?.semiMajorAxisKm ?? 0) - (b.orbitSummary?.semiMajorAxisKm ?? 0))
    }
    return map
  }, [catalog])

  const major = useMemo(() => {
    if (!catalog) return { star: [], planets: [], dwarfs: [] }
    const star = catalog.bodies.filter((body) => body.type === 'star')
    const planets = catalog.bodies.filter((body) => body.type === 'planet')
    const dwarfs = catalog.bodies.filter((body) => body.type === 'dwarfPlanet')
    return { star, planets, dwarfs }
  }, [catalog])

  const notableMinor = useMemo(() => {
    const store: MinorBodyStore | null = catalog?.minorBodies ?? null
    if (!store) return []
    const rows: Array<{ index: number; label: string; meta: string }> = []
    for (let index = 0; index < store.records.length; index++) {
      const record = store.records[index]
      if (!record.notable) continue
      rows.push({ index, label: record.name, meta: record.id })
    }
    return rows.slice(0, 40)
  }, [catalog])

  const pick = (id: string) => {
    props.onSelect(id)
  }

  const renderRow = (body: CelestialBody, indent = 0) => (
    <button
      key={body.id}
      type="button"
      className="object-row"
      data-selected={props.selectedId === body.id}
      style={{ paddingLeft: `${0.5 + indent * 0.9}rem` }}
      onClick={() => pick(body.id)}
      onDoubleClick={() => props.onFlyTo(body.id)}
      title={`${displayName(body, language)} — ${t('doubleClickHint')}`}
    >
      <i className="dot" style={{ background: typeColour(body.type) }} />
      <span>{displayName(body, language)}</span>
      <span className="object-row__meta">{radiusLabel(body)}</span>
    </button>
  )

  return (
    <aside className="sidebar" aria-label={t('objects')}>
      <div className="sidebar__head">
        <h2>{t('objects')}</h2>
        <button type="button" className="inspector__close" aria-label={t('close')} onClick={() => props.onClose()}>
          ×
        </button>
      </div>
      <div className="sidebar__tabs" role="tablist">
        <button type="button" className="tab" role="tab" aria-selected={tab === 'major'} data-active={tab === 'major'} onClick={() => setTab('major')}>
          {t('groupPlanets')}
        </button>
        <button type="button" className="tab" role="tab" aria-selected={tab === 'moons'} data-active={tab === 'moons'} onClick={() => setTab('moons')}>
          {t('groupMoons')}
        </button>
        <button type="button" className="tab" role="tab" aria-selected={tab === 'minor'} data-active={tab === 'minor'} onClick={() => setTab('minor')}>
          {t('groupMinor')}
        </button>
      </div>

      <div className="sidebar__list" role="tabpanel">
        {tab === 'major' && (
          <>
            <p className="group-label">{t('groupStar')}</p>
            {major.star.map((body) => renderRow(body))}
            <p className="group-label">{t('groupPlanets')}</p>
            {major.planets.map((body) => (
              <div key={body.id}>
                {renderRow(body)}
                {(byParent.get(body.id) ?? []).slice(0, 12).map((moon) => renderRow(moon, 1))}
              </div>
            ))}
            <p className="group-label">{t('groupDwarfs')}</p>
            {major.dwarfs.map((body) => (
              <div key={body.id}>
                {renderRow(body)}
                {(byParent.get(body.id) ?? []).map((moon) => renderRow(moon, 1))}
              </div>
            ))}
          </>
        )}

        {tab === 'moons' && (
          <>
            {[...byParent.entries()]
              .sort((a, b) => (byParent.get(b[0])?.length ?? 0) - (byParent.get(a[0])?.length ?? 0))
              .map(([parentId, moons]) => {
                const parent = catalog?.bodyById.get(parentId)
                return (
                  <div key={parentId}>
                    <p className="group-label">{parent ? `${displayName(parent, language)} · ${moons.length}` : parentId}</p>
                    {moons.map((moon) => renderRow(moon, 1))}
                  </div>
                )
              })}
          </>
        )}

        {tab === 'minor' && (
          <>
            {notableMinor.length === 0 && <p className="note note--warn">{t('noMinorCatalog')}</p>}
            {notableMinor.map((row) => (
              <button
                key={row.index}
                type="button"
                className="object-row"
                data-selected={props.selectedMinorIndex === row.index}
                onClick={() => props.onSelectMinor(row.index)}
              >
                <i className="dot" style={{ background: 'var(--comet)' }} />
                <span>{row.label}</span>
                <span className="object-row__meta">{row.meta}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  )
}

function displayName(body: CelestialBody, language: 'zh-CN' | 'en-US'): string {
  if (language === 'zh-CN' && body.nameZh) return `${body.nameZh} · ${body.name}`
  return body.name
}

function radiusLabel(body: CelestialBody): string {
  const radius = body.physical.meanRadiusKm
  if (!radius) return ''
  return radius >= 1000 ? `${(radius / 1000).toFixed(1)}×10³ km` : `${radius.toFixed(0)} km`
}

export { typeKey }