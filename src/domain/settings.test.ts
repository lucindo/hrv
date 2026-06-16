import { describe, expect, it } from 'vitest'

import {
  isValidBpm,
  isValidInhaleShare,
  isValidDuration,
  isValidTheme,
  isValidTimbre,
  isValidCue,
  isValidLocale,
  isValidWarmUp,
  isValidCoolDown,
  isValidRampDuration,
  validateSettings,
  validateStretchSettings,
  getClosestLowerStretchTargetBpm,
  getNextDurationOption,
  getStretchSettingsWithInitialBpm,
  getStretchTargetBpmOptions,
  DEFAULT_SETTINGS,
  DEFAULT_STRETCH_SETTINGS,
  DEFAULT_CUE,
} from './settings'
import type { SessionSettings, StretchSettings } from './settings'

describe('isValidBpm (range 1.0–7.0)', () => {
  it('returns true for preset members (e.g. 5.5) and the bounds (1, 7)', () => {
    expect(isValidBpm(5.5)).toBe(true)
    expect(isValidBpm(1)).toBe(true)
    expect(isValidBpm(7)).toBe(true)
  })

  it('returns true for in-range non-preset values (advanced free-set, e.g. 3.35)', () => {
    expect(isValidBpm(3.35)).toBe(true)
    expect(isValidBpm(6.83)).toBe(true)
  })

  it('returns false for out-of-range numbers (0, 7.5)', () => {
    expect(isValidBpm(0)).toBe(false)
    expect(isValidBpm(7.5)).toBe(false)
  })

  it('returns false for wrong type (string "5", null) and NaN / Infinity', () => {
    expect(isValidBpm('5')).toBe(false)
    expect(isValidBpm(null)).toBe(false)
    expect(isValidBpm(NaN)).toBe(false)
    expect(isValidBpm(Infinity)).toBe(false)
  })
})

describe('isValidInhaleShare (range 10–50, exhale ≥ inhale)', () => {
  it('returns true for presets and in-range non-preset values', () => {
    expect(isValidInhaleShare(40)).toBe(true)
    expect(isValidInhaleShare(35)).toBe(true)
    expect(isValidInhaleShare(10)).toBe(true)
    expect(isValidInhaleShare(50)).toBe(true)
  })

  it('returns false above the 50 cap (exhale must stay ≥ inhale) and below 10', () => {
    expect(isValidInhaleShare(60)).toBe(false)
    expect(isValidInhaleShare(5)).toBe(false)
  })

  it('returns false for wrong type / NaN', () => {
    expect(isValidInhaleShare('40')).toBe(false)
    expect(isValidInhaleShare(NaN)).toBe(false)
  })
})

describe('isValidDuration (HYGIENE-02 D-08)', () => {
  it('returns true for DURATION_OPTIONS numeric members (e.g. 10)', () => {
    expect(isValidDuration(10)).toBe(true)
  })

  it('returns true for "open-ended" sentinel', () => {
    expect(isValidDuration('open-ended')).toBe(true)
  })

  it('returns false for out-of-range numbers (7), arbitrary strings ("forever"), null', () => {
    expect(isValidDuration(7)).toBe(false)
    expect(isValidDuration('forever')).toBe(false)
    expect(isValidDuration(null)).toBe(false)
  })
})

describe('duration and stretch option helpers', () => {
  it('returns the next duration option without crossing past open-ended', () => {
    expect(getNextDurationOption(10)).toBe(15)
    expect(getNextDurationOption(60)).toBe('open-ended')
    expect(getNextDurationOption('open-ended')).toBeUndefined()
  })

  it('returns only target BPM options below the stretch initial BPM', () => {
    expect(getStretchTargetBpmOptions(3)).toEqual([1, 1.5, 2, 2.5])
  })

  it('chooses the nearest lower stretch target BPM for an initial BPM', () => {
    expect(getClosestLowerStretchTargetBpm(5)).toBe(4.5)
  })

  it('keeps the current target BPM when changing initial BPM still leaves it valid', () => {
    const settings = { ...DEFAULT_STRETCH_SETTINGS, initialBpm: 6, targetBpm: 4 }

    expect(getStretchSettingsWithInitialBpm(settings, 5)).toEqual({
      ...settings,
      initialBpm: 5,
    })
  })

  it('snaps target BPM below initial BPM when changing initial BPM invalidates it', () => {
    const settings = { ...DEFAULT_STRETCH_SETTINGS, initialBpm: 2, targetBpm: 1.5 }

    expect(getStretchSettingsWithInitialBpm(settings, 1.5)).toEqual({
      ...settings,
      initialBpm: 1.5,
      targetBpm: 1,
    })
  })
})

describe('isValidTheme (INFRA-02 D-01)', () => {
  it('returns true for THEME_OPTIONS members (e.g. "system")', () => {
    expect(isValidTheme('system')).toBe(true)
  })

  it('returns false for malformed strings ("Light", "neon", "")', () => {
    expect(isValidTheme('Light')).toBe(false)
    expect(isValidTheme('neon')).toBe(false)
    expect(isValidTheme('')).toBe(false)
  })

  it('returns false for wrong type (null, undefined, 0, array)', () => {
    expect(isValidTheme(null)).toBe(false)
    expect(isValidTheme(undefined)).toBe(false)
    expect(isValidTheme(0)).toBe(false)
    expect(isValidTheme(['light'])).toBe(false)
  })
})

describe('isValidTimbre (INFRA-02 D-01)', () => {
  it('returns true for TIMBRE_OPTIONS members (e.g. "bowl")', () => {
    expect(isValidTimbre('bowl')).toBe(true)
  })

  it('returns false for malformed strings ("Bowl", "trumpet", "")', () => {
    expect(isValidTimbre('Bowl')).toBe(false)
    expect(isValidTimbre('trumpet')).toBe(false)
    expect(isValidTimbre('')).toBe(false)
  })

  it('returns false for wrong type (null, undefined, 0, array)', () => {
    expect(isValidTimbre(null)).toBe(false)
    expect(isValidTimbre(undefined)).toBe(false)
    expect(isValidTimbre(0)).toBe(false)
    expect(isValidTimbre(['bowl'])).toBe(false)
  })
})

describe('isValidCue (Phase 25 CUE-01)', () => {
  it('returns true for all CUE_OPTIONS members: labels, arrow, nose', () => {
    expect(isValidCue('labels')).toBe(true)
    expect(isValidCue('arrow')).toBe(true)
    expect(isValidCue('nose')).toBe(true)
  })

  it('returns false for variant-like strings that are not cue options ("orb", "square", "diamond")', () => {
    expect(isValidCue('orb')).toBe(false)
    expect(isValidCue('square')).toBe(false)
    expect(isValidCue('diamond')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidCue('')).toBe(false)
  })

  it('returns false for wrong type (null, undefined, 42, array)', () => {
    expect(isValidCue(null)).toBe(false)
    expect(isValidCue(undefined)).toBe(false)
    expect(isValidCue(42)).toBe(false)
    expect(isValidCue(['labels'])).toBe(false)
  })
})

describe('DEFAULT_CUE (Phase 25 CUE-01)', () => {
  it('DEFAULT_CUE is "arrow" (set via quick task 260519-9mi, superseding CONTEXT D-01)', () => {
    expect(DEFAULT_CUE).toBe('arrow')
  })
})

describe('isValidLocale (INFRA-02 D-01)', () => {
  it('returns true for LOCALE_OPTIONS members (e.g. "en")', () => {
    expect(isValidLocale('en')).toBe(true)
  })

  it('returns false for malformed strings ("pt_BR" underscore, "EN", "")', () => {
    expect(isValidLocale('pt_BR')).toBe(false)
    expect(isValidLocale('EN')).toBe(false)
    expect(isValidLocale('')).toBe(false)
  })

  it('returns false for wrong type (null, undefined, 0, array)', () => {
    expect(isValidLocale(null)).toBe(false)
    expect(isValidLocale(undefined)).toBe(false)
    expect(isValidLocale(0)).toBe(false)
    expect(isValidLocale(['en'])).toBe(false)
  })
})

// Stretch predicate tests (isValidMode was removed — these remain)

describe('isValidWarmUp (STRETCH-03, D-07)', () => {
  it('returns true for WARMUP_MINUTES_OPTIONS members (2, 3, 4, 5, 10)', () => {
    expect(isValidWarmUp(2)).toBe(true)
    expect(isValidWarmUp(5)).toBe(true)
    expect(isValidWarmUp(10)).toBe(true)
  })

  it('returns false for non-option numbers (0, 7, 15, -1)', () => {
    expect(isValidWarmUp(0)).toBe(false)
    expect(isValidWarmUp(7)).toBe(false)
    expect(isValidWarmUp(15)).toBe(false)
    expect(isValidWarmUp(-1)).toBe(false)
  })

  it('returns false for "open-ended" (not valid for warm-up)', () => {
    expect(isValidWarmUp('open-ended')).toBe(false)
  })

  it('returns false for wrong type (null, undefined, NaN)', () => {
    expect(isValidWarmUp(null)).toBe(false)
    expect(isValidWarmUp(undefined)).toBe(false)
    expect(isValidWarmUp(NaN)).toBe(false)
  })
})

describe('isValidCoolDown (STRETCH-03, D-07, D-11)', () => {
  it('returns true for COOLDOWN_OPTIONS numeric members (2, 5, 15, 30)', () => {
    expect(isValidCoolDown(2)).toBe(true)
    expect(isValidCoolDown(5)).toBe(true)
    expect(isValidCoolDown(15)).toBe(true)
    expect(isValidCoolDown(30)).toBe(true)
  })

  it('returns true for "open-ended" sentinel (D-11)', () => {
    expect(isValidCoolDown('open-ended')).toBe(true)
  })

  it('returns false for non-option numbers (0, 7, 11) and arbitrary strings ("foo")', () => {
    expect(isValidCoolDown(0)).toBe(false)
    expect(isValidCoolDown(7)).toBe(false)
    expect(isValidCoolDown(11)).toBe(false)
    expect(isValidCoolDown('foo')).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isValidCoolDown(null)).toBe(false)
    expect(isValidCoolDown(undefined)).toBe(false)
  })
})

describe('isValidRampDuration (STRETCH-03, D-07)', () => {
  it('returns true for RAMP_DURATION_OPTIONS members (2, 3, 4, 5, 10)', () => {
    expect(isValidRampDuration(2)).toBe(true)
    expect(isValidRampDuration(5)).toBe(true)
    expect(isValidRampDuration(10)).toBe(true)
  })

  it('returns false for non-option numbers (7, 0, 15, 20)', () => {
    expect(isValidRampDuration(7)).toBe(false)
    expect(isValidRampDuration(0)).toBe(false)
    expect(isValidRampDuration(15)).toBe(false)
    expect(isValidRampDuration(20)).toBe(false)
  })

  it('returns false for "open-ended" and other strings', () => {
    expect(isValidRampDuration('open-ended')).toBe(false)
    expect(isValidRampDuration('20')).toBe(false)
  })

  it('returns false for NaN and Infinity', () => {
    expect(isValidRampDuration(NaN)).toBe(false)
    expect(isValidRampDuration(Infinity)).toBe(false)
  })
})

// SessionSettings is now standard-only (3 fields)
describe('SessionSettings and validateSettings (D-01, D-02, STRETCH-03)', () => {
  it('DEFAULT_SETTINGS has exactly bpm, inhaleShare, durationMinutes — no mode field', () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty('mode')
    expect(DEFAULT_SETTINGS).toHaveProperty('bpm')
    expect(DEFAULT_SETTINGS).toHaveProperty('inhaleShare')
    expect(DEFAULT_SETTINGS).toHaveProperty('durationMinutes')
  })

  it('validateSettings accepts valid standard settings (3 fields only)', () => {
    const valid: SessionSettings = { bpm: 5.5, inhaleShare: 40, durationMinutes: 10 }
    expect(() => validateSettings(valid)).not.toThrow()
    const result = validateSettings(valid)
    expect(result.bpm).toBe(5.5)
    expect(result.inhaleShare).toBe(40)
    expect(result.durationMinutes).toBe(10)
  })

  it('validateSettings throws RangeError for invalid bpm', () => {
    const bad: SessionSettings = { bpm: 999, inhaleShare: 40, durationMinutes: 10 }
    expect(() => validateSettings(bad)).toThrow(RangeError)
  })

  it('validateSettings throws RangeError for invalid inhaleShare', () => {
    const bad: SessionSettings = { bpm: 5.5, inhaleShare: 99, durationMinutes: 10 }
    expect(() => validateSettings(bad)).toThrow(RangeError)
  })

  it('validateSettings throws RangeError for invalid durationMinutes', () => {
    const bad: SessionSettings = { bpm: 5.5, inhaleShare: 40, durationMinutes: 7 }
    expect(() => validateSettings(bad)).toThrow(RangeError)
  })
})

// DEFAULT_STRETCH_SETTINGS: typed as StretchSettings, includes inhaleShare, all six fields
describe('DEFAULT_STRETCH_SETTINGS (D-01, D-02, STRETCH-03)', () => {
  it('has inhaleShare field (consumed by buildStretchSegments)', () => {
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('inhaleShare')
    expect(DEFAULT_STRETCH_SETTINGS.inhaleShare).toBe(40)
  })

  it('has all six ramp fields: inhaleShare, initialBpm, targetBpm, warmUpMinutes, rampDurationMinutes, coolDownMinutes', () => {
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('initialBpm')
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('targetBpm')
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('warmUpMinutes')
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('rampDurationMinutes')
    expect(DEFAULT_STRETCH_SETTINGS).toHaveProperty('coolDownMinutes')
  })

})

// validateStretchSettings: new function carrying the former stretch-branch checks
describe('validateStretchSettings (D-01, D-02, STRETCH-03)', () => {
  const validStretch: StretchSettings = {
    inhaleShare: 40,
    targetInhaleShare: 40,
    initialBpm: 6,
    targetBpm: 4,
    warmUpMinutes: 5,
    coolDownMinutes: 5,
    rampDurationMinutes: 10,
  }

  it('accepts a valid StretchSettings object', () => {
    expect(() => validateStretchSettings(validStretch)).not.toThrow()
    const result = validateStretchSettings(validStretch)
    expect(result.initialBpm).toBe(6)
    expect(result.targetBpm).toBe(4)
    expect(result.inhaleShare).toBe(40)
  })

  it('throws RangeError for invalid initialBpm (not in BPM_OPTIONS)', () => {
    const bad: StretchSettings = { ...validStretch, initialBpm: 999 }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('throws RangeError when targetBpm >= initialBpm (down-only constraint, D-02)', () => {
    const equalBpm: StretchSettings = { ...validStretch, targetBpm: 6 }  // equal
    expect(() => validateStretchSettings(equalBpm)).toThrow(RangeError)
    const higherBpm: StretchSettings = { ...validStretch, targetBpm: 7 }  // higher
    expect(() => validateStretchSettings(higherBpm)).toThrow(RangeError)
  })

  it('throws RangeError for invalid warmUpMinutes', () => {
    const bad: StretchSettings = { ...validStretch, warmUpMinutes: 7 as never }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('throws RangeError for invalid coolDownMinutes', () => {
    const bad: StretchSettings = { ...validStretch, coolDownMinutes: 'forever' as never }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('throws RangeError for invalid rampDurationMinutes', () => {
    const bad: StretchSettings = { ...validStretch, rampDurationMinutes: 7 }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('throws RangeError for invalid inhaleShare', () => {
    const bad: StretchSettings = { ...validStretch, inhaleShare: 99 }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('throws RangeError for invalid targetInhaleShare', () => {
    const bad: StretchSettings = { ...validStretch, targetInhaleShare: 99 }
    expect(() => validateStretchSettings(bad)).toThrow(RangeError)
  })

  it('accepts a targetInhaleShare that differs from the start share in either direction (no ordering constraint, FR-11)', () => {
    const moreExhale: StretchSettings = { ...validStretch, inhaleShare: 50, targetInhaleShare: 20 }
    expect(() => validateStretchSettings(moreExhale)).not.toThrow()
    const moreInhale: StretchSettings = { ...validStretch, inhaleShare: 20, targetInhaleShare: 50 }
    expect(() => validateStretchSettings(moreInhale)).not.toThrow()
  })
})
