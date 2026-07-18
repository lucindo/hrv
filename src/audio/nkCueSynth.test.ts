import { describe, expect, it } from 'vitest'

import {
  END_CHORD_RINGOUT_SEC,
  scheduleCountdownTick,
  scheduleNKBackMarker,
  scheduleEndChord,
  scheduleNKFinalTick,
  scheduleNKFrontMarker,
  scheduleNKTick,
} from './nkCueSynth'
import { TIMBRE_OPTIONS } from '../domain/settings'

// Test helper: relies on FakeAudioContext polyfill installed by vitest.setup.ts.
function createAc(): AudioContext {
  return new AudioContext()
}

describe('nkCueSynth', () => {
  // All builders share the (ac, when, destination, timbre) signature.
  const builders: Array<[string, typeof scheduleNKTick]> = [
    ['scheduleNKFrontMarker', scheduleNKFrontMarker],
    ['scheduleNKBackMarker', scheduleNKBackMarker],
    ['scheduleNKTick', scheduleNKTick],
    ['scheduleNKFinalTick', scheduleNKFinalTick],
    ['scheduleCountdownTick', scheduleCountdownTick],
    ['scheduleEndChord', scheduleEndChord],
  ]

  // -- CueHandle shape contract (anchored at `when`, cleanupAt in the future) --
  it.each(builders)('%s returns a CueHandle anchored at `when` with cleanupAt after it', (_name, build) => {
    const ac = createAc()
    const handle = build(ac, 2.0, ac.destination, 'bowl')
    expect(handle.envelope).toBeDefined()
    expect(handle.scheduledAt).toBe(2.0)
    expect(handle.cleanupAt).toBeGreaterThan(handle.scheduledAt)
  })

  // -- every builder is timbre-safe across the full TimbreId set --------------
  it.each(builders)('%s does not throw for any TimbreId', (_name, build) => {
    const ac = createAc()
    for (const timbre of TIMBRE_OPTIONS) {
      expect(() => build(ac, 1.0, ac.destination, timbre)).not.toThrow()
    }
  })

  // -- Spike 005: end chord retuned to "Warm pad fade" -----------------------

  it('scheduleEndChord rings out long enough for the Warm pad fade envelope (Spike 005)', () => {
    const ac = createAc()
    const when = 1.0
    const handle = scheduleEndChord(ac, when, ac.destination, 'bowl')
    // Warm pad fade is ~5 s; the pre-Spike-005 strike chord was 1.8 s. A span
    // well past 4 s proves the pad-length retune is in effect.
    expect(handle.cleanupAt - handle.scheduledAt).toBeGreaterThan(4)
  })

  it('END_CHORD_RINGOUT_SEC equals the scheduleEndChord handle ring-out span', () => {
    // The Navi Kriya teardown in App.tsx defers AudioContext.close() by this
    // many seconds. It MUST track the real chord span — a stale value cut the
    // 5s Warm pad fade short on NK while HRV (which reads cue.cleanupAt) was
    // fine. This guard fails if the exported constant ever drifts from the
    // chord scheduleEndChord actually produces.
    const ac = createAc()
    const when = 1.0
    const handle = scheduleEndChord(ac, when, ac.destination, 'bowl')
    expect(handle.cleanupAt - handle.scheduledAt).toBeCloseTo(END_CHORD_RINGOUT_SEC, 5)
  })

  // -- tick is soft and short (barely-there) ---------------------------------

  it('scheduleNKTick duration is shorter than scheduleEndChord duration (D-07 barely-there)', () => {
    const ac = createAc()
    const when = 1.0

    const tickHandle = scheduleNKTick(ac, when, ac.destination, 'bowl')
    const endHandle = scheduleEndChord(ac, when, ac.destination, 'bowl')

    const tickDuration = tickHandle.cleanupAt - tickHandle.scheduledAt
    const endDuration = endHandle.cleanupAt - endHandle.scheduledAt

    expect(tickDuration).toBeLessThan(endDuration)
  })

  // -- Spike 004: countdown beep retuned to "Crisp ping" --------------------

  it('countdown beep is shorter than the per-OM tick (Spike 004 — the two diverged)', () => {
    const ac = createAc()
    const when = 1.0

    const countdownHandle = scheduleCountdownTick(ac, when, ac.destination, 'bowl')
    const tickHandle = scheduleNKTick(ac, when, ac.destination, 'bowl')

    const countdownDuration = countdownHandle.cleanupAt - countdownHandle.scheduledAt
    const tickDuration = tickHandle.cleanupAt - tickHandle.scheduledAt

    expect(countdownDuration).toBeLessThan(tickDuration)
  })
})
