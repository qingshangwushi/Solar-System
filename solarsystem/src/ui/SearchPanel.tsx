/**
 * Global search.
 *
 * Queries the MiniSearch index built from the ~11 000 catalogued bodies and the
 * large-object catalog. Results show the name, the category and the parent system,
 * and selecting one flies the camera to the object — the "search and fly to any
 * catalogued body" behaviour the specification requires.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SearchHit } from '../data/SearchIndex'
import type { Translate } from '../i18n'
import { bucketKey, typeKey } from './formatters'

export interface SearchPanelProps {
  t: Translate
  language: 'zh-CN' | 'en-US'
  hits: SearchHit[]
  query: string
  onQuery: (query: string) => void
  onSelectHit: (hit: SearchHit) => void
  onClose: () => void
}

export function SearchPanel(props: SearchPanelProps) {
  const { t } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [props.query])

  const suggestions = useMemo(() => props.hits.slice(0, 20), [props.hits])

  return (
    <aside className="flyout" aria-label={t('search')}>
      <div className="sidebar__head" style={{ padding: '0 0 0.5rem' }}>
        <h2>{t('search')}</h2>
        <button type="button" className="inspector__close" aria-label={t('close')} onClick={() => props.onClose()}>
          ×
        </button>
      </div>
      <label htmlFor="global-search" style={{ display: 'none' }}>
        {t('search')}
      </label>
      <input
        id="global-search"
        ref={inputRef}
        className="search-input"
        value={props.query}
        placeholder={t('searchPlaceholder')}
        autoComplete="off"
        onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(0, index - 1))
          } else if (event.key === 'Enter' && suggestions[activeIndex]) {
            props.onSelectHit(suggestions[activeIndex])
          } else if (event.key === 'Escape') {
            props.onClose()
          }
        }}
      />
      <ul className="search-results">
        {props.query.trim() === '' && <li className="note">{t('searchEmpty')}</li>}
        {props.query.trim() !== '' && suggestions.length === 0 && <li className="note">{t('searchNoResult')}</li>}
        {suggestions.map((hit, index) => (
          <li key={`${hit.kind}:${hit.id}`}>
            <button
              type="button"
              data-active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => props.onSelectHit(hit)}
            >
              <span>{hit.kind === 'body' && props.language === 'zh-CN' && hit.nameZh ? `${hit.nameZh} · ${hit.name}` : hit.name}</span>
              <span className="kind">
                {hit.kind === 'minorBody' ? t(bucketKey(hit.typeLabel)) : t(typeKey(hit.typeLabel))}
                {hit.designation ? ` · ${hit.designation.split(' ')[0]}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}