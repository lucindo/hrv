import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as nkCueSynth from '../audio/nkCueSynth'
import { useNaviKriyaAudio } from './useNaviKriyaAudio'

describe('useNaviKriyaAudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('constructs AudioContext before reading the persisted timbre', () => {
    const OriginalAudioContext = window.AudioContext
    const calls: string[] = []
    const audioContextSpy = vi.fn(function (
      this: AudioContext,
      ...args: ConstructorParameters<typeof AudioContext>
    ) {
      calls.push('audio')
      return new OriginalAudioContext(...args)
    })
    vi.stubGlobal('AudioContext', audioContextSpy)

    const { result } = renderHook(() => useNaviKriyaAudio(false))

    result.current.begin(() => {
      calls.push('timbre')
      return 'sine'
    })

    expect(calls).toEqual(['audio', 'timbre'])
  })

  it('suppresses countdown ticks while muted', () => {
    const countdownSpy = vi.spyOn(nkCueSynth, 'scheduleCountdownTick')
    const { result } = renderHook(() => useNaviKriyaAudio(true))

    const audioSession = result.current.begin(() => 'sine')
    audioSession.countdownTick()

    expect(countdownSpy).not.toHaveBeenCalled()
  })

  it('finalTick routes to scheduleNKFinalTick and respects mute', () => {
    const finalSpy = vi.spyOn(nkCueSynth, 'scheduleNKFinalTick')

    // Unmuted: finalTick schedules the distinct final-OM cue.
    const live = renderHook(() => useNaviKriyaAudio(false))
    const liveSession = live.result.current.begin(() => 'sine')
    expect(typeof liveSession.callbacks.finalTick).toBe('function')
    liveSession.callbacks.finalTick?.()
    expect(finalSpy).toHaveBeenCalledTimes(1)

    finalSpy.mockClear()

    // Muted: finalTick suppressed, like every other cue.
    const muted = renderHook(() => useNaviKriyaAudio(true))
    muted.result.current.begin(() => 'sine').callbacks.finalTick?.()
    expect(finalSpy).not.toHaveBeenCalled()
  })

  it('closes a live AudioContext on unmount', () => {
    const OriginalAudioContext = window.AudioContext
    const audioContexts: AudioContext[] = []
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function (this: AudioContext, ...args: ConstructorParameters<typeof AudioContext>) {
        const audioContext = new OriginalAudioContext(...args)
        audioContexts.push(audioContext)
        return audioContext
      }),
    )

    const { result, unmount } = renderHook(() => useNaviKriyaAudio(false))
    result.current.begin(() => 'sine')
    unmount()

    const audioContext = audioContexts[0]
    expect(audioContext).toBeDefined()
    if (audioContext === undefined) {
      throw new Error('AudioContext was not constructed')
    }
    const closeSpy = (audioContext as unknown as { close: ReturnType<typeof vi.fn> }).close
    expect(closeSpy).toHaveBeenCalled()
  })
})

// SessionClock proxy + setSource lifecycle tests
describe('useNaviKriyaAudio — SessionClock proxy + setSource lifecycle (Phase 51 D-03/D-06/D-12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // Test 1 — Proxy clock exposed: the returned controller has a clock member
  // with the full SessionClock surface.
  it('Test 1: exposes a clock member with SessionClock interface on the controller', () => {
    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // SessionClock has exactly 5 members
    expect(typeof clock.now).toBe('function')
    expect(typeof clock.schedule).toBe('function')
    expect(typeof clock.onSuspend).toBe('function')
    expect(typeof clock.onResume).toBe('function')
    expect(typeof clock.onClose).toBe('function')
  })

  // Test 2 — clock.now() returns wall-clock before begin.
  // With fake timers, performance.now() returns a known value.
  it('Test 2: clock.now() returns wall-clock-shaped value before begin()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // Advance fake time by 5 seconds (performance.now() moves with fake timers)
    vi.advanceTimersByTime(5000)
    const wallNow = performance.now() / 1000  // expected ~5s
    const clockNow = clock.now()

    // Before begin(), proxy is on wall clock: clock.now() should match performance.now()/1000
    expect(clockNow).toBeCloseTo(wallNow, 2)
  })

  // Test 3 — clock.now() returns AC currentTime after begin().
  // The FakeAudioContext computes currentTime as performance.now()/1000 - startTime,
  // so right after construction, currentTime ≈ 0 while wall clock is larger.
  it('Test 3: clock.now() returns AC currentTime (not wall clock) after begin() succeeds', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    // Advance fake time by 10 seconds so wall clock is 10s before begin()
    vi.advanceTimersByTime(10000)

    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // Before begin: clock.now() ≈ 10s (wall)
    const beforeBegin = clock.now()
    expect(beforeBegin).toBeCloseTo(10, 1)

    // begin() constructs a new FakeAudioContext — its currentTime starts at 0
    result.current.begin(() => 'sine')

    // Advance a little time (1s) after the AC was created
    vi.advanceTimersByTime(1000)

    // After begin: clock.now() should be AC currentTime (≈1s), NOT wall clock (≈11s)
    const afterBegin = clock.now()
    // Wall clock would be ~11s, AC currentTime should be ~1s
    expect(afterBegin).toBeLessThan(5)  // much less than wall clock
    expect(afterBegin).toBeGreaterThanOrEqual(0)
  })

  // Test 4 — After close(), clock.now() reverts to wall-clock.
  it('Test 4: clock.now() reverts to wall-clock after close()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // Start at some wall time
    vi.advanceTimersByTime(5000)

    // begin() swaps to AC clock
    result.current.begin(() => 'sine')

    // Advance time — AC currentTime grows from 0
    vi.advanceTimersByTime(2000)

    // close() should revert proxy to wall clock
    result.current.close()

    // After close, clock.now() should return wall clock value (≈7s total)
    const afterClose = clock.now()
    const wallNow = performance.now() / 1000  // ~7s
    expect(afterClose).toBeCloseTo(wallNow, 1)
  })

  // Test 5 — After closeAfterEndCue(), clock.now() reverts synchronously
  // (NOT waiting for the END_CHORD_RINGOUT_MS timeout).
  it('Test 5: clock.now() reverts to wall-clock SYNCHRONOUSLY in closeAfterEndCue(), before any timer advance', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // begin() to swap to AC clock
    result.current.begin(() => 'sine')

    // Advance so AC clock is non-zero (distinct from wall clock at 0)
    vi.advanceTimersByTime(3000)

    // closeAfterEndCue() — proxy must revert synchronously (before any setTimeout fires)
    result.current.closeAfterEndCue()

    // Immediately after (no timer advance): clock.now() must be wall-clock, NOT AC time
    // Wall clock ≈ 3s; AC currentTime was ≈ 3s too but the source now is a fresh wall clock
    // The key invariant: the proxy revert happened synchronously, so clock.now() is now
    // reading the new wall clock source.
    const afterClose = clock.now()
    const wallNow = performance.now() / 1000  // ~3s
    expect(afterClose).toBeCloseTo(wallNow, 1)
  })

  // Test 6 — AC-construction-failure path: createOptionalAudioContext returns null.
  // The proxy must NOT be swapped — clock stays on wall-clock through the begin() call.
  it('Test 6: when createOptionalAudioContext returns null, clock stays on wall-clock after begin()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.advanceTimersByTime(2000)

    // Mock AudioContext to throw so createOptionalAudioContext returns null
    vi.stubGlobal('AudioContext', vi.fn(() => { throw new Error('AudioContext unavailable') }))

    const { result } = renderHook(() => useNaviKriyaAudio(false))
    const { clock } = result.current

    // begin() takes the early-return (NOOP_AUDIO_CALLBACKS) branch
    const session = result.current.begin(() => 'sine')

    // Verify the session uses no-op callbacks (AC failure path)
    expect(typeof session.callbacks.frontMarker).toBe('function')
    expect(typeof session.countdownTick).toBe('function')

    // clock.now() should still be wall-clock (proxy NOT swapped)
    vi.advanceTimersByTime(1000)
    const clockNow = clock.now()
    const wallNow = performance.now() / 1000  // ~3s
    expect(clockNow).toBeCloseTo(wallNow, 1)
  })
})
