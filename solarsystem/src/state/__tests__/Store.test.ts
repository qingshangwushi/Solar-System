/**
 * UI state tests for the Zustand store.
 *
 * The renderer and the engine need a GPU, so they are covered by
 * scripts/smoke-test.mjs. These tests exercise the stateful layer the React UI is
 * built on instead: which fields a selection transition touches, how the layer
 * filters and search results are recorded, and the toast bookkeeping. No DOM is
 * needed, so the suite runs in the default Node environment.
 *
 * The transitions mirror exactly what src/App.tsx and src/ui/useEngine.ts write to
 * the store (`set({ bodyDescription, selectedId, selectedMinorIndex })` and the
 * symmetric clear), because there is no separate selection action to call.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getEngine, requireEngine, useAppStore } from '../store'
import type { BodyDescription } from '../../engine/SolarSystemEngine'

/** Full initial state, captured once so every case starts from a clean store. */
const defaults = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(defaults)
})

const earthDescription = { id: 'earth', name: 'Earth' } as unknown as BodyDescription

describe('selection transitions', () => {
  it('starts with no selection and the browser panel open', () => {
    const state = useAppStore.getState()
    expect(state.selectedId).toBeNull()
    expect(state.selectedMinorIndex).toBeNull()
    expect(state.bodyDescription).toBeNull()
    expect(state.minorDescription).toBeNull()
    expect(state.browserOpen).toBe(true)
  })

  it('selecting a rendered body sets the id and clears the minor selection', () => {
    // A minor body was selected first, then the visitor picks a planet.
    useAppStore.getState().setState({ selectedId: null, selectedMinorIndex: 7, minorDescription: null })
    useAppStore.getState().setState({
      selectedId: 'earth',
      selectedMinorIndex: null,
      bodyDescription: earthDescription,
      minorDescription: null,
    })
    const state = useAppStore.getState()
    expect(state.selectedId).toBe('earth')
    expect(state.selectedMinorIndex).toBeNull()
    expect(state.bodyDescription).toBe(earthDescription)
    expect(state.minorDescription).toBeNull()
  })

  it('selecting a minor body clears the rendered-body selection', () => {
    useAppStore.getState().setState({ selectedId: 'earth', bodyDescription: earthDescription })
    useAppStore.getState().setState({ selectedId: null, selectedMinorIndex: 3, bodyDescription: null, minorDescription: null })
    const state = useAppStore.getState()
    expect(state.selectedId).toBeNull()
    expect(state.selectedMinorIndex).toBe(3)
    expect(state.bodyDescription).toBeNull()
  })

  it('clearing the selection resets every selection field at once', () => {
    useAppStore.getState().setState({ selectedId: 'earth', selectedMinorIndex: 2, bodyDescription: earthDescription })
    // This is the exact patch App.tsx applies when the inspector is closed.
    useAppStore.getState().setState({ selectedId: null, selectedMinorIndex: null, bodyDescription: null, minorDescription: null })
    const state = useAppStore.getState()
    expect(state.selectedId).toBeNull()
    expect(state.selectedMinorIndex).toBeNull()
    expect(state.bodyDescription).toBeNull()
    expect(state.minorDescription).toBeNull()
  })
})

describe('layer filters', () => {
  it('starts with no filter active', () => {
    expect(useAppStore.getState().activeFilters).toEqual([])
  })

  it('records a filter set change and can clear it again', () => {
    useAppStore.getState().setState({ activeFilters: ['mainBelt', 'trojan'] })
    expect(useAppStore.getState().activeFilters).toEqual(['mainBelt', 'trojan'])
    useAppStore.getState().setState({ activeFilters: ['tno', 'centaur', 'comet'] })
    expect(useAppStore.getState().activeFilters).toEqual(['tno', 'centaur', 'comet'])
    useAppStore.getState().setState({ activeFilters: [] })
    expect(useAppStore.getState().activeFilters).toEqual([])
  })

  it('keeps the layer visibility flags independent from the filters', () => {
    useAppStore.getState().setState({ minorVisible: true, orbitVisible: false, labelVisible: false })
    const state = useAppStore.getState()
    expect(state.minorVisible).toBe(true)
    expect(state.orbitVisible).toBe(false)
    expect(state.labelVisible).toBe(false)
    expect(state.activeFilters).toEqual([])
  })
})

describe('search result bookkeeping', () => {
  it('stores the query and its hits together', () => {
    const hit = {
      id: 'earth',
      kind: 'body' as const,
      name: 'Earth',
      nameZh: '地球',
      typeLabel: 'planet',
      parentLabel: 'Sun',
      parentNameZh: '太阳',
      number: null,
      designation: 'Earth',
      score: 3.5,
    }
    useAppStore.getState().setSearchResults('地球', [hit])
    const state = useAppStore.getState()
    expect(state.searchQuery).toBe('地球')
    expect(state.searchResults).toHaveLength(1)
    expect(state.searchResults[0]?.id).toBe('earth')
  })

  it('clears the hits when the query is emptied', () => {
    useAppStore.getState().setSearchResults('x', [{ id: 'a', kind: 'body', name: 'A', nameZh: null, typeLabel: 'planet', parentLabel: null, parentNameZh: null, number: null, designation: '', score: 1 }])
    useAppStore.getState().setSearchResults('', [])
    expect(useAppStore.getState().searchQuery).toBe('')
    expect(useAppStore.getState().searchResults).toEqual([])
  })
})

describe('toasts', () => {
  it('keeps at most four toasts and dismisses by id', () => {
    const store = useAppStore.getState()
    for (const message of ['a', 'b', 'c', 'd', 'e']) store.pushToast('info', message)
    const toasts = useAppStore.getState().toasts
    expect(toasts.length).toBeLessThanOrEqual(4)
    expect(toasts.at(-1)?.message).toBe('e')
    useAppStore.getState().dismissToast(toasts.at(-1)!.id)
    expect(useAppStore.getState().toasts.some((toast) => toast.id === toasts.at(-1)!.id)).toBe(false)
  })
})

describe('engine holder', () => {
  it('throws a clear error when used before the engine is created', () => {
    expect(getEngine()).toBeNull()
    expect(() => requireEngine()).toThrowError(/engine has not been created/)
  })
})
