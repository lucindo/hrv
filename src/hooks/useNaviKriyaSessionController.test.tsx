// useNaviKriyaSessionController smoke test: confirms the controller renders without
// crashing after the hook-call-order flip and the naviAudio.clock → useNKEngine wiring.
// The test-double for useNaviKriyaAudio includes a no-op `clock` member.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NK_OM_SECONDS, type NaviKriyaSettings } from '../domain/naviKriyaSettings'
import type { UseWakeLock } from './useWakeLock'
import { useNaviKriyaSessionController } from './useNaviKriyaSessionController'

// Stable default settings for smoke tests
const defaultSettings: NaviKriyaSettings = {
  frontCount: 8,
  omSeconds: NK_OM_SECONDS.medium,
  rounds: 1,
  perOmCue: false,
  distinctFinalTick: false,
}

// No-op wake lock test double (matches UseWakeLock interface)
const makeWakeLock = (): UseWakeLock => ({
  request: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined),
})

describe('useNaviKriyaSessionController (Phase 51 Plan 03 — D-02 wiring smoke tests)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Smoke test 1: hook renders without crashing after the naviAudio → nkEngine order flip
  it('renders without crashing in idle state', () => {
    const { result, unmount } = renderHook(() =>
      useNaviKriyaSessionController({
        activePractice: 'naviKriya',
        initialSettings: defaultSettings,
        muted: true,
        wakeLock: makeWakeLock(),
      }),
    )

    // Initial idle state
    expect(result.current.phase).toBe('idle')
    expect(result.current.running).toBe(false)
    expect(result.current.starting).toBe(false)
    expect(result.current.sessionActive).toBe(false)
    expect(result.current.leadInDigit).toBeNull()
    expect(result.current.justCompleted).toBe(false)
    expect(result.current.endDialogOpen).toBe(false)

    unmount()
  })

  // Smoke test 2: start() does not throw; controller transitions to 'starting' state
  it('start() transitions to starting=true without throwing', () => {
    const { result, unmount } = renderHook(() =>
      useNaviKriyaSessionController({
        activePractice: 'naviKriya',
        initialSettings: defaultSettings,
        muted: true,
        wakeLock: makeWakeLock(),
      }),
    )

    act(() => {
      result.current.start()
    })

    expect(result.current.starting).toBe(true)
    expect(result.current.sessionActive).toBe(true)

    unmount()
  })

  // Smoke test 3: setSettings updates settings without throwing
  it('setSettings updates settings without throwing', () => {
    const { result, unmount } = renderHook(() =>
      useNaviKriyaSessionController({
        activePractice: 'naviKriya',
        initialSettings: defaultSettings,
        muted: false,
        wakeLock: makeWakeLock(),
      }),
    )

    const newSettings: NaviKriyaSettings = { ...defaultSettings, rounds: 3 }
    act(() => {
      result.current.setSettings(newSettings)
    })

    expect(result.current.settings.rounds).toBe(3)

    unmount()
  })

  // Smoke test 4: cancelStart() from starting state returns to idle without throwing
  it('cancelStart() from starting state returns to idle', () => {
    const { result, unmount } = renderHook(() =>
      useNaviKriyaSessionController({
        activePractice: 'naviKriya',
        initialSettings: defaultSettings,
        muted: true,
        wakeLock: makeWakeLock(),
      }),
    )

    act(() => {
      result.current.start()
    })
    expect(result.current.starting).toBe(true)

    act(() => {
      result.current.cancelStart()
    })
    expect(result.current.starting).toBe(false)
    expect(result.current.sessionActive).toBe(false)

    unmount()
  })
})
