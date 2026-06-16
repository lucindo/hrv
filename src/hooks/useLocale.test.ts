import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useLocale } from './useLocale'
import { STATE_KEY } from '../storage'
import type { UserPrefs } from '../storage/prefs'

// Helper: seed the localStorage with a full envelope containing the given prefs.
// Per-field coerce guarantees valid values on read.
function seedPrefs(prefs: UserPrefs): void {
  window.localStorage.setItem(
    STATE_KEY,
    JSON.stringify({ version: 1, prefs }),
  )
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
  document.documentElement.lang = ''
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.lang = ''
  vi.restoreAllMocks()
})

describe('useLocale', () => {
  it('seeds state from loadPrefs().locale at mount and returns matching uiStrings', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')
    expect(result.current.uiStrings.practice.controls.startSession.length).toBeGreaterThan(0)
  })

  it('writes document.documentElement.lang on mount (apply effect)', () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    renderHook(() => useLocale())
    expect(document.documentElement.lang).toBe('en')
  })

  it('updates document.documentElement.lang on locale change via storage event', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    renderHook(() => useLocale())
    expect(document.documentElement.lang).toBe('en')

    const newEnvelope = JSON.stringify({ version: 1, prefs: { ...DEFAULT_FULL_PREFS, locale: 'pt-BR' } })
    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.localStorage.setItem(STATE_KEY, newEnvelope)
      window.dispatchEvent(new StorageEvent('storage', { key: STATE_KEY, newValue: newEnvelope, oldValue: null }))
    })

    expect(document.documentElement.lang).toBe('pt-BR')
  })

  it('updates locale via cross-tab storage event with key === STATE_KEY', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    const newEnvelope = JSON.stringify({ version: 1, prefs: { ...DEFAULT_FULL_PREFS, locale: 'pt-BR' } })
    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.localStorage.setItem(STATE_KEY, newEnvelope)
      window.dispatchEvent(new StorageEvent('storage', { key: STATE_KEY, newValue: newEnvelope, oldValue: null }))
    })

    expect(result.current.locale).toBe('pt-BR')
  })

  it('ignores cross-tab storage event with non-STATE_KEY key', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other-key', newValue: 'irrelevant', oldValue: null }))
    })

    expect(result.current.locale).toBe('en')
  })

  it('updates locale via same-tab hrv:prefs-changed CustomEvent with detail.key === "locale"', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    // Seed disk before dispatching (handler reads disk synchronously via loadPrefs)
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'pt-BR' })
    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.dispatchEvent(new CustomEvent('hrv:prefs-changed', { detail: { key: 'locale', value: 'pt-BR' } }))
    })

    expect(result.current.locale).toBe('pt-BR')
  })

  it('ignores same-tab hrv:prefs-changed CustomEvent with detail.key === "theme"', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    // Seed disk with pt-BR (should not be picked up since key filter rejects "theme")
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'pt-BR' })
    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.dispatchEvent(new CustomEvent('hrv:prefs-changed', { detail: { key: 'theme', value: 'dark' } }))
    })

    // locale must remain unchanged — theme key is not the locale filter
    expect(result.current.locale).toBe('en')
  })

  it('updates locale via same-tab hrv:prefs-changed with detail: {} (undefined key — D-21 forward-compat)', async () => {
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'en' })
    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    // Seed disk before dispatching broadcast-all event (handler reads disk synchronously)
    seedPrefs({ ...DEFAULT_FULL_PREFS, locale: 'pt-BR' })
    // Reason: async wrapper required to match act()'s async overload; no real awaitable work inside.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      window.dispatchEvent(new CustomEvent('hrv:prefs-changed', { detail: {} }))
    })

    // undefined key branch: re-reads loadPrefs().locale unconditionally
    expect(result.current.locale).toBe('pt-BR')
  })
})
