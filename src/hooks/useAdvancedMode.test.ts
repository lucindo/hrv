import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAdvancedMode } from './useAdvancedMode'
import { DEFAULT_PREFS, savePrefs } from '../storage/prefs'

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { window.localStorage.clear() })

describe('useAdvancedMode', () => {
  it('seeds false when nothing is stored, true when persisted', () => {
    expect(renderHook(() => useAdvancedMode()).result.current).toBe(false)
    savePrefs({ ...DEFAULT_PREFS, advanced: true })
    expect(renderHook(() => useAdvancedMode()).result.current).toBe(true)
  })

  it('re-reads when the same-tab hrv:prefs-changed event fires for advanced', () => {
    const { result } = renderHook(() => useAdvancedMode())
    expect(result.current).toBe(false)
    act(() => {
      savePrefs({ ...DEFAULT_PREFS, advanced: true })
      window.dispatchEvent(new CustomEvent('hrv:prefs-changed', { detail: { key: 'advanced' } }))
    })
    expect(result.current).toBe(true)
  })

  it('ignores prefs-changed events for unrelated keys', () => {
    const { result } = renderHook(() => useAdvancedMode())
    act(() => {
      savePrefs({ ...DEFAULT_PREFS, advanced: true })
      window.dispatchEvent(new CustomEvent('hrv:prefs-changed', { detail: { key: 'theme' } }))
    })
    expect(result.current).toBe(false)
  })
})
