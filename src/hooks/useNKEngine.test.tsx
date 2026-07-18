import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWallSessionClock } from '../audio/sessionClock'
import type { NaviKriyaSettings } from '../domain/naviKriyaSettings'
import { NK_LEAD_SEC, NK_OM_SECONDS, useNKEngine } from './useNKEngine'

// NK_LEAD_SEC is seconds; vi.advanceTimersByTime takes ms. Convert once at the
// test-file boundary so the rest of the math reads ms-shaped.
const NK_LEAD_MS_FOR_TIMERS = NK_LEAD_SEC * 1000

// Wall clock identity-piped under vitest fake timers (performance.now() is
// fake-timer-controlled). Each test gets a fresh instance via the factory.

const makeClock = () => createWallSessionClock()

// Default small settings so tests finish quickly under fake timers
const defaultSettings: NaviKriyaSettings = {
  frontCount: 8,  // backCount = 2
  omSeconds: NK_OM_SECONDS.medium,
  rounds: 1,
  perOmCue: true,
  distinctFinalTick: false,
}

const makeCallbacks = () => ({
  frontMarker: vi.fn(),
  backMarker: vi.fn(),
  tick: vi.fn(),
  finalTick: vi.fn(),
  endCue: vi.fn(),
})

describe('useNKEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // NK-01: full front→back→done traversal with frontCount:8 rounds:1
  it('NK-01: auto-advances front->back->done; front->back transition resets count to 0', () => {
    const onComplete = vi.fn()
    const cbs = makeCallbacks()
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => {
      result.current.start(defaultSettings, cbs, onComplete)
    })

    // Should be in 'front' phase now, running
    expect(result.current.nkPhase).toBe('front')
    expect(result.current.nkRunning).toBe(true)

    // Timing — every OM runs for omMs, except the LAST OM of a phase, which
    // holds for NK_LAST_OM_HOLD_MULTIPLIER × omMs (= 1.5×) before the transition:
    //   front OM #k fires at t = NK_LEAD_MS_FOR_TIMERS + (k-1)*omMs, k = 1..8
    //   front OM #8 (last) holds 1.5×omMs -> front->back transition at
    //   t = NK_LEAD_MS_FOR_TIMERS + 7*omMs + 1.5*omMs = NK_LEAD_MS_FOR_TIMERS + 8.5*omMs
    const omMs = NK_OM_SECONDS['medium'] * 1000

    // Advance through the front lead-in + all 8 front OMs + the transition —
    // stop +500 into the back lead-in, before the first back OM.
    act(() => {
      vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS + omMs * 8.5 + 500)
    })

    // Should now be in 'back' phase with count reset to 0
    expect(result.current.nkPhase).toBe('back')
    expect(result.current.nkCount).toBe(0)

    // Back lead-in + 2 back OMs (the 2nd held 1.5×omMs) + the final transition
    // -> 'done'.
    act(() => {
      vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS + omMs * 2.5 + 100)
    })

    // Should be 'done'
    expect(result.current.nkPhase).toBe('done')
    expect(result.current.nkRunning).toBe(false)
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ isComplete: true, completedRounds: 1 }),
    )

    unmount()
  })

  // NK-02: rounds:3 produces 3 front+back cycles before done; nkRound reaches 3
  it('NK-02: 3 rounds produces 3 front+back cycles; nkRound reaches 3', () => {
    const onComplete = vi.fn()
    const cbs = makeCallbacks()
    const settings: NaviKriyaSettings = {
      frontCount: 4,   // backCount = 1
      omSeconds: NK_OM_SECONDS.fast,
      rounds: 3,
      perOmCue: false,
      distinctFinalTick: false,
    }
    const omMs = NK_OM_SECONDS['fast'] * 1000
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => {
      result.current.start(settings, cbs, onComplete)
    })

    // Each round: front = lead + 3 OMs + the last OM held 1.5×omMs (= lead +
    // 4.5*omMs); back = lead + the single OM held 1.5×omMs (= lead + 1.5*omMs).
    // 3 rounds total.
    const perRoundMs = NK_LEAD_MS_FOR_TIMERS + omMs * 4.5 + NK_LEAD_MS_FOR_TIMERS + omMs * 1.5
    act(() => {
      vi.advanceTimersByTime(perRoundMs * 3 + 500)
    })

    expect(result.current.nkPhase).toBe('done')
    expect(result.current.nkRunning).toBe(false)
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ isComplete: true, completedRounds: 3 }),
    )

    unmount()
  })

  // NK-03: scheduled delay equals NK_OM_SECONDS[omLength]*1000
  it('NK-03: scheduled OM delay equals NK_OM_SECONDS[omLength]*1000 for medium', () => {
    const cbs = makeCallbacks()
    const onComplete = vi.fn()
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => {
      result.current.start(defaultSettings, cbs, onComplete)
    })

    // Initial state: front, count 0, running
    expect(result.current.nkCount).toBe(0)

    // Timing:
    //   t=0:               start() → schedule(NK_LEAD_MS_FOR_TIMERS)
    //   t=NK_LEAD_MS_FOR_TIMERS:      OM #1 fires → count=1 → schedule(omMs)
    //   t=NK_LEAD_MS_FOR_TIMERS+omMs: OM #2 fires → count=2
    //
    // Verify: advance to just before the lead-in completes → count still 0
    act(() => {
      vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS - 100)
    })
    expect(result.current.nkCount).toBe(0)

    // Advance just past the lead-in (t = NK_LEAD_MS_FOR_TIMERS + 10) → OM #1 fires → count=1.
    // Keep the overshoot small so the omMs-window assertions below stay precise.
    act(() => {
      vi.advanceTimersByTime(110)
    })
    expect(result.current.nkCount).toBe(1)

    const omMs = NK_OM_SECONDS['medium'] * 1000

    // Advance by less than omMs — count should still be 1
    act(() => {
      vi.advanceTimersByTime(omMs - 50)
    })
    expect(result.current.nkCount).toBe(1)

    // Advance past one full omMs — count should be 2
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.nkCount).toBe(2)

    unmount()
  })

  // NK-06: perOmCue=false suppresses tick; perOmCue=true fires once per OM
  it('NK-06: perOmCue=false: tick not called; perOmCue=true: tick called per OM', () => {
    const omMs = NK_OM_SECONDS['fast'] * 1000

    // Test perOmCue=false
    {
      const cbs = makeCallbacks()
      const settings: NaviKriyaSettings = {
        frontCount: 4,
        omSeconds: NK_OM_SECONDS.fast,
        rounds: 1,
        perOmCue: false,
        distinctFinalTick: false,
      }
      const { result, unmount } = renderHook(() => useNKEngine(makeClock()))
      act(() => { result.current.start(settings, cbs, vi.fn()) })
      act(() => {
        vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS + omMs * 4 + 100)
      })
      expect(cbs.tick).not.toHaveBeenCalled()
      expect(cbs.finalTick).not.toHaveBeenCalled()
      unmount()
    }

    vi.clearAllMocks()
    vi.useFakeTimers()

    // Test perOmCue=true
    {
      const cbs = makeCallbacks()
      const settings: NaviKriyaSettings = {
        frontCount: 4,
        omSeconds: NK_OM_SECONDS.fast,
        rounds: 1,
        perOmCue: true,
        distinctFinalTick: false,
      }
      const { result, unmount } = renderHook(() => useNKEngine(makeClock()))
      act(() => { result.current.start(settings, cbs, vi.fn()) })
      // Advance through just front phase (4 OMs)
      act(() => {
        vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS + omMs * 4 + 100)
      })
      // perOmCue on ⇒ one cue per front OM = 4 (all plain ticks — distinctFinalTick
      // is off here; the finalTick-on-#4 path is covered by NK-08).
      const cueCalls = cbs.tick.mock.calls.length + cbs.finalTick.mock.calls.length
      expect(cueCalls).toBeGreaterThanOrEqual(4)
      unmount()
    }
  })

  // NK-08: the LAST OM of each count fires finalTick; every other OM fires tick.
  it('NK-08: final OM of front and back fires finalTick; other OMs fire tick', () => {
    const cbs = makeCallbacks()
    const settings: NaviKriyaSettings = {
      frontCount: 8,   // backCount = 2
      omSeconds: NK_OM_SECONDS.fast,
      rounds: 1,
      perOmCue: true,
      distinctFinalTick: true,
    }
    const omMs = NK_OM_SECONDS['fast'] * 1000
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => { result.current.start(settings, cbs, vi.fn()) })

    // Whole session: front (8 OMs, #8 held 1.5×) + back (2 OMs, #2 held 1.5×).
    act(() => {
      vi.advanceTimersByTime(
        NK_LEAD_MS_FOR_TIMERS + omMs * 8.5   // front lead-in + 8 OMs + transition
        + NK_LEAD_MS_FOR_TIMERS + omMs * 2.5 // back lead-in + 2 OMs + transition
        + 500,
      )
    })

    // finalTick on front OM #8 and back OM #2 = 2; tick on the other 7+1 = 8.
    expect(cbs.finalTick).toHaveBeenCalledTimes(2)
    expect(cbs.tick).toHaveBeenCalledTimes(8)

    unmount()
  })

  // NK-09: with distinctFinalTick off, the last OM fires the plain tick — the
  // gate suppresses finalTick even though perOmCue is on.
  it('NK-09: distinctFinalTick=false plays the normal tick on the final OM (no finalTick)', () => {
    const cbs = makeCallbacks()
    const settings: NaviKriyaSettings = {
      frontCount: 8,   // backCount = 2
      omSeconds: NK_OM_SECONDS.fast,
      rounds: 1,
      perOmCue: true,
      distinctFinalTick: false,
    }
    const omMs = NK_OM_SECONDS['fast'] * 1000
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => { result.current.start(settings, cbs, vi.fn()) })

    act(() => {
      vi.advanceTimersByTime(
        NK_LEAD_MS_FOR_TIMERS + omMs * 8.5
        + NK_LEAD_MS_FOR_TIMERS + omMs * 2.5
        + 500,
      )
    })

    // Every OM (incl. front #8 and back #2) fires the plain tick = 10; finalTick never.
    expect(cbs.finalTick).not.toHaveBeenCalled()
    expect(cbs.tick).toHaveBeenCalledTimes(10)

    unmount()
  })

  // NK-07: end() resets to idle and fires onComplete with isComplete:false
  it('NK-07: end() resets to idle and fires onComplete with isComplete:false', () => {
    const cbs = makeCallbacks()
    const onComplete = vi.fn()
    const { result, unmount } = renderHook(() => useNKEngine(makeClock()))

    act(() => {
      result.current.start(defaultSettings, cbs, onComplete)
    })

    const omMs = NK_OM_SECONDS['medium'] * 1000

    // Advance through lead-in + 2 OMs (mid-session)
    act(() => {
      vi.advanceTimersByTime(NK_LEAD_MS_FOR_TIMERS + omMs * 2 + 10)
    })

    expect(result.current.nkCount).toBeGreaterThan(0)

    // End mid-session — resets to idle
    act(() => {
      result.current.end()
    })
    expect(result.current.nkPhase).toBe('idle')
    expect(result.current.nkCount).toBe(0)
    expect(result.current.nkRound).toBe(1)
    expect(result.current.nkRunning).toBe(false)
    // onComplete should have been called with isComplete:false
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ isComplete: false }),
    )

    unmount()
  })
})
