import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  coercePractices,
  coerceActivePractice,
  coerceNaviKriyaSettings,
  coerceStretchSettings,
  loadPractices,
  loadActivePractice,
  saveActivePractice,
  saveResonantSettings,
  saveNaviKriyaSettings,
  saveStretchSettings,
  recordResonantSession,
  recordNaviKriyaSession,
  recordStretchSession,
  resetPracticeStats,
} from './practices'
import { coerceSettings } from './settings'
import { ZERO_STATS, type PersistedStats } from './stats'
import { STATE_KEY } from './storage'
import { DEFAULT_NK_SETTINGS, NK_OM_SECONDS, type NaviKriyaSettings } from '../domain/naviKriyaSettings'
import { DEFAULT_SETTINGS, DEFAULT_STRETCH_SETTINGS, type StretchSettings } from '../domain/settings'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

// A non-zero stats fixture so "subtree untouched" assertions are concrete.
function statsOf(totalSessions: number): PersistedStats {
  return {
    totalSessions,
    totalElapsedSeconds: totalSessions * 60,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 60,
  }
}

describe('coerceActivePractice (T-30-05)', () => {
  it('preserves the three known practice ids', () => {
    expect(coerceActivePractice('resonant')).toBe('resonant')
    expect(coerceActivePractice('naviKriya')).toBe('naviKriya')
    expect(coerceActivePractice('stretch')).toBe('stretch')
  })

  it('falls back to "resonant" for garbage / null / number input', () => {
    expect(coerceActivePractice('garbage')).toBe('resonant')
    expect(coerceActivePractice(null)).toBe('resonant')
    expect(coerceActivePractice(undefined)).toBe('resonant')
    expect(coerceActivePractice(5)).toBe('resonant')
  })
})

describe('coerceNaviKriyaSettings (D-02 / Pitfall 5 / T-30-06)', () => {
  it('returns DEFAULT_NK_SETTINGS field-by-field for null / non-object / array', () => {
    expect(coerceNaviKriyaSettings(null)).toEqual(DEFAULT_NK_SETTINGS)
    expect(coerceNaviKriyaSettings(undefined)).toEqual(DEFAULT_NK_SETTINGS)
    expect(coerceNaviKriyaSettings(42)).toEqual(DEFAULT_NK_SETTINGS)
    expect(coerceNaviKriyaSettings([1, 2, 3])).toEqual(DEFAULT_NK_SETTINGS)
  })

  it('preserves a fully valid NK_FRONT_COUNT_OPTIONS member (e.g. 200)', () => {
    const valid: NaviKriyaSettings = {
      frontCount: 200,
      omSeconds: NK_OM_SECONDS.slow,
      rounds: 5,
      perOmCue: false,
      distinctFinalTick: true,
    }
    expect(coerceNaviKriyaSettings(valid)).toEqual(valid)
  })

  it('rounds a non-multiple-of-4 frontCount DOWN to the nearest multiple of 4, then snaps to nearest option', () => {
    // A fractional backCount would break NK arithmetic. The coercer rounds down to
    // a multiple of 4, then snaps to the nearest NK_FRONT_COUNT_OPTIONS entry so
    // the SettingsStepper always has a valid index.
    expect(coerceNaviKriyaSettings({ frontCount: 102 }).frontCount).toBe(100)   // 102→100 (multiple-of-4 floor), 100 is in options
    expect(coerceNaviKriyaSettings({ frontCount: 90 }).frontCount).toBe(100)    // 90→88 (floor), snap(88)=100
    expect(coerceNaviKriyaSettings({ frontCount: 88 }).frontCount).toBe(100)    // 88 already multiple of 4, snap(88)=100
  })

  it('falls back to the default frontCount for non-positive / non-finite values', () => {
    expect(coerceNaviKriyaSettings({ frontCount: 0 }).frontCount).toBe(DEFAULT_NK_SETTINGS.frontCount)
    expect(coerceNaviKriyaSettings({ frontCount: -8 }).frontCount).toBe(DEFAULT_NK_SETTINGS.frontCount)
    expect(coerceNaviKriyaSettings({ frontCount: 2 }).frontCount).toBe(DEFAULT_NK_SETTINGS.frontCount)
    expect(coerceNaviKriyaSettings({ frontCount: Number.NaN }).frontCount).toBe(DEFAULT_NK_SETTINGS.frontCount)
    expect(coerceNaviKriyaSettings({ frontCount: 'big' }).frontCount).toBe(DEFAULT_NK_SETTINGS.frontCount)
  })

  it('falls back per-field for a drifted omSeconds / rounds / perOmCue / distinctFinalTick', () => {
    const drifted = coerceNaviKriyaSettings({
      frontCount: 80,   // 80 is a multiple of 4 but not in new options; snaps to 100
      omSeconds: 9,     // out of the 1.0–4.0 range
      rounds: 0,
      perOmCue: 'yes',
      distinctFinalTick: 'nope',
    })
    expect(drifted.frontCount).toBe(100)   // 80→snap→100 (nearest option)
    expect(drifted.omSeconds).toBe(DEFAULT_NK_SETTINGS.omSeconds)
    expect(drifted.rounds).toBe(DEFAULT_NK_SETTINGS.rounds)
    expect(drifted.perOmCue).toBe(DEFAULT_NK_SETTINGS.perOmCue)
    expect(drifted.distinctFinalTick).toBe(DEFAULT_NK_SETTINGS.distinctFinalTick)
  })

  it('snaps stale persisted frontCounts to the nearest NK_FRONT_COUNT_OPTIONS entry (260519-91w)', () => {
    // Returning user values from the old [4..160] options list must snap so
    // SettingsStepper always receives a valid selectedIndex (not -1).
    // 40 → floor(40/4)*4=40 → nearest to [100,200,300,400,500]: 100 (dist=60)
    expect(coerceNaviKriyaSettings({ frontCount: 40 }).frontCount).toBe(100)
    // 60 → 60 → nearest: 100 (dist=40)
    expect(coerceNaviKriyaSettings({ frontCount: 60 }).frontCount).toBe(100)
    // 80 → 80 → nearest: 100 (dist=20)
    expect(coerceNaviKriyaSettings({ frontCount: 80 }).frontCount).toBe(100)
    // 120 → 120 → nearest: 100 (dist=20, not 200 dist=80)
    expect(coerceNaviKriyaSettings({ frontCount: 120 }).frontCount).toBe(100)
    // 160 → 160 → nearest: 100 (dist=60, not 200 dist=40) — 160 is closer to 200
    expect(coerceNaviKriyaSettings({ frontCount: 160 }).frontCount).toBe(200)
    // 4 → 4 → sub-100 → nearest: 100 (minimum)
    expect(coerceNaviKriyaSettings({ frontCount: 4 }).frontCount).toBe(100)
    // 200 is a valid option → passes through unchanged
    expect(coerceNaviKriyaSettings({ frontCount: 200 }).frontCount).toBe(200)
    // 150 → floor(150/4)*4=148 → nearest: 100 (dist=48) vs 200 (dist=52) → 100
    expect(coerceNaviKriyaSettings({ frontCount: 150 }).frontCount).toBe(100)
    // 152 → floor(152/4)*4=152 → nearest: 100 (dist=52) vs 200 (dist=48) → 200
    expect(coerceNaviKriyaSettings({ frontCount: 152 }).frontCount).toBe(200)
  })
})

describe('coercePractices (PRACTICE-02 / T-30-05)', () => {
  const defaultMap = {
    resonant: { settings: coerceSettings(undefined), stats: ZERO_STATS },
    stretch: { settings: DEFAULT_STRETCH_SETTINGS, stats: ZERO_STATS },
    naviKriya: { settings: DEFAULT_NK_SETTINGS, stats: ZERO_STATS },
  }

  it('returns the default practice map for null / undefined / non-object / array', () => {
    expect(coercePractices(null)).toEqual(defaultMap)
    expect(coercePractices(undefined)).toEqual(defaultMap)
    expect(coercePractices(99)).toEqual(defaultMap)
    expect(coercePractices(['x'])).toEqual(defaultMap)
  })

  it('preserves valid resonant, stretch, and naviKriya slices', () => {
    const stretchSettings: StretchSettings = { ...DEFAULT_STRETCH_SETTINGS, initialBpm: 6 }
    const map = coercePractices({
      resonant: { settings: { ...DEFAULT_SETTINGS, bpm: 4 }, stats: statsOf(3) },
      stretch: { settings: stretchSettings, stats: statsOf(2) },
      // frontCount 200 is in NK_FRONT_COUNT_OPTIONS — passes through unchanged
      naviKriya: { settings: { frontCount: 200, omSeconds: NK_OM_SECONDS.slow, rounds: 5, perOmCue: false }, stats: statsOf(7) },
    })
    expect(map.resonant.settings.bpm).toBe(4)
    expect(map.resonant.stats).toEqual(statsOf(3))
    expect(map.stretch.settings.initialBpm).toBe(6)
    expect(map.stretch.stats).toEqual(statsOf(2))
    expect(map.naviKriya.settings).toEqual({ frontCount: 200, omSeconds: NK_OM_SECONDS.slow, rounds: 5, perOmCue: false, distinctFinalTick: false })
    expect(map.naviKriya.stats).toEqual(statsOf(7))
  })

  it('falls back per-field for a drifted slice without discarding the other practices', () => {
    const map = coercePractices({
      resonant: { settings: { bpm: 4 }, stats: statsOf(2) },
      naviKriya: { settings: { frontCount: 90, omSeconds: 'turbo' }, stats: 'corrupt' },
    })
    expect(map.resonant.stats).toEqual(statsOf(2))
    // naviKriya slice drifted: frontCount 90→88 (multiple-of-4 floor)→100 (snap
    // to nearest NK_FRONT_COUNT_OPTIONS entry), omSeconds falls back, corrupt stats
    // coerce to ZERO_STATS — resonant is untouched.
    expect(map.naviKriya.settings.frontCount).toBe(100)
    expect(map.naviKriya.settings.omSeconds).toBe(DEFAULT_NK_SETTINGS.omSeconds)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })
})

describe('loadPractices / loadActivePractice defaults', () => {
  it('returns the default practice map when nothing is stored', () => {
    expect(loadPractices()).toEqual({
      resonant: { settings: coerceSettings(undefined), stats: ZERO_STATS },
      stretch: { settings: DEFAULT_STRETCH_SETTINGS, stats: ZERO_STATS },
      naviKriya: { settings: DEFAULT_NK_SETTINGS, stats: ZERO_STATS },
    })
  })

  it('returns "resonant" as the default active practice when nothing is stored', () => {
    expect(loadActivePractice()).toBe('resonant')
  })
})

describe('per-practice round-trips (PRACTICE-02)', () => {
  it('saveActivePractice → loadActivePractice round-trips the id', () => {
    saveActivePractice('naviKriya')
    expect(loadActivePractice()).toBe('naviKriya')
    saveActivePractice('resonant')
    expect(loadActivePractice()).toBe('resonant')
  })

  it('saveNaviKriyaSettings → loadPractices().naviKriya.settings round-trips (valid option member)', () => {
    // Use a frontCount that is in NK_FRONT_COUNT_OPTIONS so the coercer on load
    // passes it through unchanged (300 is a valid option: multiple of 100 and 4).
    const settings: NaviKriyaSettings = {
      frontCount: 300,
      omSeconds: NK_OM_SECONDS.fast,
      rounds: 4,
      perOmCue: false,
      distinctFinalTick: false,
    }
    saveNaviKriyaSettings(settings)
    expect(loadPractices().naviKriya.settings).toEqual(settings)
  })

  it('saveResonantSettings → loadPractices().resonant.settings round-trips', () => {
    const settings = { ...DEFAULT_SETTINGS, bpm: 4 }
    saveResonantSettings(settings)
    expect(loadPractices().resonant.settings.bpm).toBe(4)
  })

  it('saveResonantSettings does not throw when underlying setItem throws (D-16)', () => {
    // Coverage migrated from the deleted settings.test.ts saveSettings block:
    // the resonant settings write path must swallow a quota failure silently.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => { saveResonantSettings({ ...DEFAULT_SETTINGS, bpm: 4 }) }).not.toThrow()
  })

  it('loadPractices falls back to defaults when stored JSON is corrupt (D-17)', () => {
    // Corrupt-JSON fallback for the settings read path — previously asserted
    // via loadSettings in settings.test.ts, now exercised through loadPractices.
    window.localStorage.setItem(STATE_KEY, '{not-json')
    expect(loadPractices().resonant.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('saveNaviKriyaSettings leaves the resonant slice untouched', () => {
    saveResonantSettings({ ...DEFAULT_SETTINGS, bpm: 4 })
    saveNaviKriyaSettings({ frontCount: 80, omSeconds: NK_OM_SECONDS.slow, rounds: 2, perOmCue: true, distinctFinalTick: false })
    expect(loadPractices().resonant.settings.bpm).toBe(4)
  })
})

describe('recordResonantSession (Pitfall 3 / T-30-08)', () => {
  it('increments only practices.resonant.stats and leaves naviKriya untouched', () => {
    const next = recordResonantSession(40_000, false, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
    const map = loadPractices()
    expect(map.resonant.stats.totalSessions).toBe(1)
    expect(map.resonant.stats.totalElapsedSeconds).toBe(40)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })

  it('does not count a sub-threshold incomplete session', () => {
    const next = recordResonantSession(5_000, false)
    expect(next.totalSessions).toBe(0)
    expect(loadPractices().resonant.stats.totalSessions).toBe(0)
  })

  it('does NOT count 29.999s but counts exactly 30.000s (boundary inclusive — D-01)', () => {
    expect(recordResonantSession(29_999, false, { now: () => 1 }).totalSessions).toBe(0)
    expect(recordResonantSession(30_000, false, { now: () => 1 }).totalSessions).toBe(1)
  })

  it('counts a sub-threshold session when isComplete is true', () => {
    const next = recordResonantSession(5_000, true, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
  })

  it('rejects a NaN / negative elapsedMs without poisoning stats', () => {
    expect(recordResonantSession(Number.NaN, true).totalSessions).toBe(0)
    expect(recordResonantSession(-100, true).totalSessions).toBe(0)
  })

  it('adds the rounds count to totalSessions (a completed 3-round practice = +3 rounds)', () => {
    const next = recordResonantSession(900_000, true, { now: () => 1 }, 3)
    expect(next.totalSessions).toBe(3)
    expect(loadPractices().resonant.stats.totalSessions).toBe(3)
  })

  it('defaults to +1 round for a single-block session', () => {
    expect(recordResonantSession(40_000, true, { now: () => 1 }).totalSessions).toBe(1)
  })
})

describe('recordNaviKriyaSession (NK-08 / D-13 / T-31-07 / T-31-08)', () => {
  it('increments practices.naviKriya.stats totalSessions and roundsCompleted', () => {
    const next = recordNaviKriyaSession(60_000, 3, true, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
    expect(next.totalElapsedSeconds).toBe(60)
    expect(next.roundsCompleted).toBe(3)
    expect(next.lastSessionAtMs).toBe(1_700_000_000_000)
    expect(next.lastSessionDurationSeconds).toBe(60)
  })

  it('accumulates roundsCompleted across multiple NK sessions', () => {
    recordNaviKriyaSession(60_000, 2, true, { now: () => 1 })
    const next = recordNaviKriyaSession(90_000, 3, true, { now: () => 2 })
    expect(next.totalSessions).toBe(2)
    expect(next.roundsCompleted).toBe(5)
  })

  it('NK-08 isolation: practices.resonant.stats is unchanged after recordNaviKriyaSession', () => {
    // Seed resonant with some stats first.
    recordResonantSession(40_000, false, { now: () => 1_700_000_000_000 })
    // Then record an NK session.
    recordNaviKriyaSession(50_000, 2, true, { now: () => 2_000_000_000_000 })
    const map = loadPractices()
    // Resonant stats must be exactly what recordResonantSession wrote.
    expect(map.resonant.stats.totalSessions).toBe(1)
    expect(map.resonant.stats.totalElapsedSeconds).toBe(40)
    // naviKriya received the NK session.
    expect(map.naviKriya.stats.totalSessions).toBe(1)
    expect(map.naviKriya.stats.roundsCompleted).toBe(2)
  })

  it('does not count a sub-threshold incomplete session (early end below COUNT_THRESHOLD_MS)', () => {
    // Below-threshold early end is NOT recorded.
    const next = recordNaviKriyaSession(5_000, 2, false)
    expect(next.totalSessions).toBe(0)
    expect(next.roundsCompleted).toBeUndefined()
    expect(loadPractices().naviKriya.stats.totalSessions).toBe(0)
  })

  it('D-13: above-threshold early end records completed rounds and elapsed minutes', () => {
    // Early end but above COUNT_THRESHOLD_MS — should record.
    const next = recordNaviKriyaSession(35_000, 1, false, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
    expect(next.totalElapsedSeconds).toBe(35)
    expect(next.roundsCompleted).toBe(1)
  })

  it('rejects NaN / negative elapsedMs without poisoning stats (T-31-08)', () => {
    expect(recordNaviKriyaSession(Number.NaN, 3, true).totalSessions).toBe(0)
    expect(recordNaviKriyaSession(-100, 3, true).totalSessions).toBe(0)
  })
})


describe('v1→v2→v3 migration through loadPractices (PRACTICE-04 / Phase-34)', () => {
  it('populates loadPractices().resonant from a seeded flat v1 envelope', () => {
    // A returning user's pre-Phase-30 flat envelope.
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1,
      settings: { ...DEFAULT_SETTINGS, bpm: 4 },
      stats: statsOf(8),
    }))
    const map = loadPractices()
    // The flat resonant data survived the readEnvelope→migrateEnvelope→
    // coercePractices path with nothing lost.
    expect(map.resonant.settings.bpm).toBe(4)
    expect(map.resonant.stats).toEqual(statsOf(8))
    // stretch: seeded from resonant settings blob; stats zeroed.
    expect(map.stretch.settings).toBeDefined()
    expect(map.stretch.stats).toEqual(ZERO_STATS)
    // naviKriya had no v1 data — the coercer supplies defaults.
    expect(map.naviKriya.settings).toEqual(DEFAULT_NK_SETTINGS)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })
})

describe('coerceStretchSettings (Phase 34 T-34-02)', () => {
  it('returns DEFAULT_STRETCH_SETTINGS for null / undefined / non-object / array', () => {
    expect(coerceStretchSettings(null)).toEqual(DEFAULT_STRETCH_SETTINGS)
    expect(coerceStretchSettings(undefined)).toEqual(DEFAULT_STRETCH_SETTINGS)
    expect(coerceStretchSettings(42)).toEqual(DEFAULT_STRETCH_SETTINGS)
    expect(coerceStretchSettings([])).toEqual(DEFAULT_STRETCH_SETTINGS)
  })

  it('preserves a fully valid StretchSettings object', () => {
    const valid: StretchSettings = {
      inhaleShare: 30,
      targetInhaleShare: 30,
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 10,
      rampDurationMinutes: 10,
      coolDownMinutes: 10,
    }
    expect(coerceStretchSettings(valid)).toEqual(valid)
  })

  it('falls back per-field — one drifted field does not discard the rest', () => {
    // initialBpm: 'x' is invalid; all other fields are valid
    const result = coerceStretchSettings({
      inhaleShare: 30,
      initialBpm: 'x',   // drifted
      targetBpm: 4,
      warmUpMinutes: 10,
      rampDurationMinutes: 10,
      coolDownMinutes: 10,
    })
    expect(result.initialBpm).toBe(DEFAULT_STRETCH_SETTINGS.initialBpm)
    expect(result.inhaleShare).toBe(30)
    expect(result.targetBpm).toBe(4)
    expect(result.warmUpMinutes).toBe(10)
    expect(result.rampDurationMinutes).toBe(10)
    expect(result.coolDownMinutes).toBe(10)
  })

  it('falls back a missing targetInhaleShare to the coerced start share (FR-13 backward-compat)', () => {
    // A pre-target persisted slice has no targetInhaleShare key — it must adopt the
    // (coerced) start share so the session behaves exactly as it did before.
    const result = coerceStretchSettings({
      inhaleShare: 30,
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 10,
      rampDurationMinutes: 10,
      coolDownMinutes: 10,
    })
    expect(result.targetInhaleShare).toBe(30)
  })

  it('falls back an invalid targetInhaleShare to the coerced start share (FR-13)', () => {
    const result = coerceStretchSettings({
      inhaleShare: 20,
      targetInhaleShare: 'garbage',
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 10,
      rampDurationMinutes: 10,
      coolDownMinutes: 10,
    })
    expect(result.targetInhaleShare).toBe(20)
  })

  it('coerces a removed phase value (warmUp 15, ramp 20) to the default (FR-4)', () => {
    const result = coerceStretchSettings({
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 15,  // no longer an option
      rampDurationMinutes: 20,  // no longer an option
      coolDownMinutes: 10,
    })
    expect(result.warmUpMinutes).toBe(DEFAULT_STRETCH_SETTINGS.warmUpMinutes)
    expect(result.rampDurationMinutes).toBe(DEFAULT_STRETCH_SETTINGS.rampDurationMinutes)
    expect(result.coolDownMinutes).toBe(10)  // still a valid option — preserved
  })

  it('rejects prototype-polluting __proto__ object and returns defaults (asRecord guard)', () => {
    const polluted: unknown = JSON.parse(
      '{"ratio":"30:70","initialBpm":6,"targetBpm":4,"warmUpMinutes":5,"rampDurationMinutes":5,"coolDownMinutes":5,"__proto__":{"polluted":true}}'
    )
    const out = coerceStretchSettings(polluted) as unknown as Record<string, unknown>
    expect(out['polluted']).toBeUndefined()
    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  // CR-01 regression: cross-field invariant enforcement
  it('CR-01: resets BOTH BPM fields to defaults when targetBpm > initialBpm (inverted ramp)', () => {
    // A persisted slice where targetBpm > initialBpm would silently produce an inverted ramp
    const result = coerceStretchSettings({ initialBpm: 4, targetBpm: 5, inhaleShare: 40, warmUpMinutes: 5, rampDurationMinutes: 5, coolDownMinutes: 5 })
    expect(result.initialBpm).toBe(DEFAULT_STRETCH_SETTINGS.initialBpm)
    expect(result.targetBpm).toBe(DEFAULT_STRETCH_SETTINGS.targetBpm)
    // The invariant must hold after coercion
    expect(result.targetBpm).toBeLessThan(result.initialBpm)
  })

  it('CR-01: resets BOTH BPM fields to defaults when targetBpm === initialBpm (equal — not a down ramp)', () => {
    // An equal-BPM slice is also invalid — the ramp span is zero
    const result = coerceStretchSettings({ initialBpm: 4, targetBpm: 4, inhaleShare: 40, warmUpMinutes: 5, rampDurationMinutes: 5, coolDownMinutes: 5 })
    expect(result.initialBpm).toBe(DEFAULT_STRETCH_SETTINGS.initialBpm)
    expect(result.targetBpm).toBe(DEFAULT_STRETCH_SETTINGS.targetBpm)
  })

  it('CR-01: resets initialBpm to default when raw initialBpm is 1 (valid in BPM_OPTIONS but not STRETCH_INITIAL_BPM_OPTIONS)', () => {
    // initialBpm: 1 is in BPM_OPTIONS but not STRETCH_INITIAL_BPM_OPTIONS (< 1.5).
    // A coerced initialBpm of 1 would collapse the targetBpm picker to an empty list.
    const result = coerceStretchSettings({ initialBpm: 1, targetBpm: 0.5, inhaleShare: 40, warmUpMinutes: 5, rampDurationMinutes: 5, coolDownMinutes: 5 })
    expect(result.initialBpm).toBe(DEFAULT_STRETCH_SETTINGS.initialBpm)
  })

  it('CR-01: a fully-valid down-ramp with STRETCH_INITIAL_BPM_OPTIONS initialBpm is returned unchanged', () => {
    // Regression: valid slices must not be affected by the new cross-field check
    const valid = { inhaleShare: 30, initialBpm: 6, targetBpm: 4.5, warmUpMinutes: 10, rampDurationMinutes: 10, coolDownMinutes: 10 }
    const result = coerceStretchSettings(valid)
    expect(result.initialBpm).toBe(6)
    expect(result.targetBpm).toBe(4.5)
    expect(result.inhaleShare).toBe(30)
  })
})

describe('saveStretchSettings / loadPractices round-trip (Phase 34 T-34-02)', () => {
  it('saveStretchSettings → loadPractices().stretch.settings round-trips the value', () => {
    const settings: StretchSettings = {
      inhaleShare: 30,
      targetInhaleShare: 30,
      initialBpm: 6,
      targetBpm: 4.5,
      warmUpMinutes: 10,
      rampDurationMinutes: 10,
      coolDownMinutes: 15,
    }
    saveStretchSettings(settings)
    expect(loadPractices().stretch.settings).toEqual(settings)
  })

  it('saveStretchSettings does not throw when underlying setItem throws (D-16)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => { saveStretchSettings(DEFAULT_STRETCH_SETTINGS) }).not.toThrow()
  })

  it('saveStretchSettings leaves resonant and naviKriya slices untouched', () => {
    saveResonantSettings({ ...DEFAULT_SETTINGS, bpm: 4 })
    // Use 200 (a valid NK_FRONT_COUNT_OPTIONS member) so the coercer on load
    // passes it through unchanged and the assertion is unambiguous.
    saveNaviKriyaSettings({ frontCount: 200, omSeconds: NK_OM_SECONDS.slow, rounds: 2, perOmCue: true, distinctFinalTick: false })
    saveStretchSettings({ ...DEFAULT_STRETCH_SETTINGS, initialBpm: 6 })
    const map = loadPractices()
    expect(map.resonant.settings.bpm).toBe(4)
    expect(map.naviKriya.settings.frontCount).toBe(200)
    expect(map.stretch.settings.initialBpm).toBe(6)
  })
})

describe('recordStretchSession (Phase 34 T-34-02)', () => {
  it('increments only practices.stretch.stats and leaves resonant and naviKriya untouched', () => {
    const next = recordStretchSession(40_000, false, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
    const map = loadPractices()
    expect(map.stretch.stats.totalSessions).toBe(1)
    expect(map.stretch.stats.totalElapsedSeconds).toBe(40)
    expect(map.resonant.stats).toEqual(ZERO_STATS)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })

  it('does not count a sub-threshold incomplete session', () => {
    const next = recordStretchSession(5_000, false)
    expect(next.totalSessions).toBe(0)
    expect(loadPractices().stretch.stats.totalSessions).toBe(0)
  })

  it('counts a sub-threshold session when isComplete is true', () => {
    const next = recordStretchSession(5_000, true, { now: () => 1_700_000_000_000 })
    expect(next.totalSessions).toBe(1)
  })

  it('rejects NaN / negative elapsedMs without poisoning stats', () => {
    expect(recordStretchSession(Number.NaN, true).totalSessions).toBe(0)
    expect(recordStretchSession(-100, true).totalSessions).toBe(0)
  })
})

describe('STATS-04 record-and-persist regression (CONTEXT D-05 / D-08)', () => {
  it('recordResonantSession increments resonant slice losslessly across loadPractices', () => {
    recordResonantSession(40_000, false, { now: () => 1_700_000_000_000 })
    const map = loadPractices()
    expect(map.resonant.stats.totalSessions).toBe(1)
    expect(map.resonant.stats.totalElapsedSeconds).toBe(40)
    expect(map.resonant.stats.lastSessionAtMs).toBe(1_700_000_000_000)
    expect(map.resonant.stats.lastSessionDurationSeconds).toBe(40)
    expect(map.stretch.stats).toEqual(ZERO_STATS)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })

  it('recordStretchSession increments stretch slice losslessly across loadPractices', () => {
    recordStretchSession(40_000, false, { now: () => 1_700_000_000_000 })
    const map = loadPractices()
    expect(map.stretch.stats.totalSessions).toBe(1)
    expect(map.stretch.stats.totalElapsedSeconds).toBe(40)
    expect(map.stretch.stats.lastSessionAtMs).toBe(1_700_000_000_000)
    expect(map.stretch.stats.lastSessionDurationSeconds).toBe(40)
    expect(map.resonant.stats).toEqual(ZERO_STATS)
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
  })

  it('recordNaviKriyaSession increments naviKriya slice losslessly across loadPractices', () => {
    recordNaviKriyaSession(60_000, 3, true, { now: () => 1_700_000_000_000 })
    const map = loadPractices()
    expect(map.naviKriya.stats.totalSessions).toBe(1)
    expect(map.naviKriya.stats.totalElapsedSeconds).toBe(60)
    expect(map.naviKriya.stats.lastSessionAtMs).toBe(1_700_000_000_000)
    expect(map.naviKriya.stats.lastSessionDurationSeconds).toBe(60)
    expect(map.naviKriya.stats.roundsCompleted).toBe(3)
    expect(map.resonant.stats).toEqual(ZERO_STATS)
    expect(map.stretch.stats).toEqual(ZERO_STATS)
  })
})

describe('resetPracticeStats — per-practice isolation', () => {
  it('zeroes only the target slice; sibling stats and settings survive', () => {
    saveResonantSettings({ ...DEFAULT_SETTINGS, bpm: 4 })
    recordResonantSession(40_000, true, { now: () => 1_700_000_000_000 })
    recordNaviKriyaSession(60_000, 3, true, { now: () => 1_700_000_000_000 })

    resetPracticeStats('naviKriya')

    const map = loadPractices()
    expect(map.naviKriya.stats).toEqual(ZERO_STATS)
    // Sibling stats untouched.
    expect(map.resonant.stats.totalSessions).toBe(1)
    // Target slice keeps its settings — reset wipes stats only.
    expect(map.resonant.settings.bpm).toBe(4)
  })
})
