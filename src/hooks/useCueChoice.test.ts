import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCueChoice } from './useCueChoice'
import { STATE_KEY } from '../storage'
import type { UserPrefs } from '../storage/prefs'

// Helper: seed localStorage with a full UserPrefs envelope.
// Uses the direct envelope shape understood by loadPrefs/coercePrefs.
function seedPrefs(prefs: UserPrefs): void {
  window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, prefs }))
}

const DEFAULT_FULL_PREFS: UserPrefs = {
  theme: 'system',
  timbre: 'bowl',
  cue: 'labels',
  locale: 'en',
  breathingShape: 'orb-halo',
  ringCue: 'progress-arc',
  orbIdle: 'ambient',
  switcherIcon: false,
  bypassSilentMode: true,
  advanced: false,
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('useCueChoice', () => {
  it('initial state matches loadPrefs().cue when localStorage is pre-seeded', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, cue: 'nose' })
    const { result } = renderHook(() => useCueChoice())
    expect(result.current.cue).toBe('nose')
  })

  it('setCue("arrow") updates local state optimistically', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, cue: 'labels' })
    const { result } = renderHook(() => useCueChoice())

    act(() => {
      result.current.setCue('arrow')
    })

    expect(result.current.cue).toBe('arrow')
  })

  it('setCue("nose") writes the new cue to disk via savePrefs', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, cue: 'labels' })
    const { result } = renderHook(() => useCueChoice())

    act(() => {
      result.current.setCue('nose')
    })

    // Verify via direct disk read (matches prefs.test.ts seeding pattern)
    // Reason: STATE_KEY is always present after setCue; non-null asserted by storage contract.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const raw = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as { version: number; prefs: UserPrefs }
    expect(raw.prefs.cue).toBe('nose')
  })

  it('setCue("arrow") preserves other prefs fields — envelope merge contract', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, theme: 'dark', timbre: 'bell', cue: 'labels', locale: 'pt-BR' })
    const { result } = renderHook(() => useCueChoice())

    act(() => {
      result.current.setCue('arrow')
    })

    // Verify all other fields are preserved (the {...loadPrefs(), cue: next} merge)
    // Reason: STATE_KEY is always present after setCue; non-null asserted by storage contract.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const raw = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as { version: number; prefs: UserPrefs }
    expect(raw.prefs.cue).toBe('arrow')
    expect(raw.prefs.theme).toBe('dark')
    expect(raw.prefs.timbre).toBe('bell')
    expect(raw.prefs.locale).toBe('pt-BR')
  })

  it('setCue("arrow") dispatches hrv:prefs-changed CustomEvent with correct detail shape', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, cue: 'labels' })
    const spy = vi.fn()
    window.addEventListener('hrv:prefs-changed', spy)

    const { result } = renderHook(() => useCueChoice())

    act(() => {
      result.current.setCue('arrow')
    })

    window.removeEventListener('hrv:prefs-changed', spy)

    expect(spy).toHaveBeenCalledTimes(1)
    // Reason: we asserted toHaveBeenCalledTimes(1) above; the array access is safe.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const event = spy.mock.calls[0]![0] as CustomEvent<{ key: string; value: string }>
    expect(event).toBeInstanceOf(CustomEvent)
    expect(event.detail.key).toBe('cue')
    expect(event.detail.value).toBe('arrow')
  })

  it('setCue identity is stable across re-renders (useCallback empty deps contract)', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, cue: 'labels' })
    const { result, rerender } = renderHook(() => useCueChoice())

    const initialSetter = result.current.setCue
    rerender()

    expect(result.current.setCue).toBe(initialSetter)
  })
})
