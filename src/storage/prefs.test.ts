import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  coercePrefs,
  coerceTheme,
  coerceTimbre,
  coerceCue,
  coerceLocale,
  coerceBreathingShape,
  coerceRingCue,
  coerceOrbIdle,
  coerceSwitcherIcon,
  coerceBypassSilentMode,
  coerceAdvanced,
  loadPrefs,
  savePrefs,
  DEFAULT_PREFS,
  type UserPrefs,
} from './prefs'
import { STATE_KEY } from './storage'
import {
  DEFAULT_THEME,
  DEFAULT_TIMBRE,
  DEFAULT_CUE,
  DEFAULT_LOCALE,
  THEME_OPTIONS,
  TIMBRE_OPTIONS,
  CUE_OPTIONS,
  LOCALE_OPTIONS,
} from '../domain/settings'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('coercePrefs (D-10 / D-17)', () => {
  it('returns DEFAULT_PREFS when raw is null / undefined / non-object', () => {
    expect(coercePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(coercePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(coercePrefs(42)).toEqual(DEFAULT_PREFS)
    expect(coercePrefs('str')).toEqual(DEFAULT_PREFS)
    expect(coercePrefs([1, 2, 3])).toEqual(DEFAULT_PREFS)
  })

  it('returns DEFAULT_PREFS when raw is empty object', () => {
    expect(coercePrefs({})).toEqual(DEFAULT_PREFS)
  })

  it('preserves all valid fields verbatim (including cue)', () => {
    const valid: UserPrefs = { ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'nose', locale: 'pt-BR' }
    expect(coercePrefs(valid)).toEqual(valid)
  })

  it('falls back PER FIELD when theme is invalid (D-17) — keeps timbre + cue + locale', () => {
    expect(coercePrefs({ theme: 'neon', timbre: 'bowl', cue: 'arrow', locale: 'en' }))
      .toEqual({ ...DEFAULT_PREFS, theme: DEFAULT_THEME, timbre: 'bowl', cue: 'arrow', locale: 'en' })
  })

  it('falls back PER FIELD when timbre is invalid (D-17) — keeps theme + cue + locale', () => {
    expect(coercePrefs({ theme: 'dark', timbre: 'trumpet', cue: 'labels', locale: 'en' }))
      .toEqual({ ...DEFAULT_PREFS, theme: 'dark', timbre: DEFAULT_TIMBRE, cue: 'labels', locale: 'en' })
  })

  it('falls back PER FIELD when cue is invalid — keeps theme + timbre + locale', () => {
    expect(coercePrefs({ theme: 'dark', timbre: 'bell', cue: 'bogus', locale: 'en' }))
      .toEqual({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: DEFAULT_CUE, locale: 'en' })
  })

  it('falls back PER FIELD when locale is invalid (D-17) — keeps theme + timbre + cue', () => {
    expect(coercePrefs({ theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt_BR' }))
      .toEqual({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'arrow', locale: DEFAULT_LOCALE })
  })

  it('pre-Phase-25 envelope (no cue key) coerces cue to default preserving three other valid fields (D-13)', () => {
    // A stored envelope with no cue key coerces to default; no STATE_VERSION bump needed.
    expect(coercePrefs({ theme: 'dark', timbre: 'bell', locale: 'pt-BR' }))
      .toEqual({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: DEFAULT_CUE, locale: 'pt-BR' })
  })

  it('tolerates legacy variant key on persisted envelope — VAR-05 forward-compat (Phase 38 D-01)', () => {
    // A returning user with a pre-v2.0 persisted envelope carrying `variant: 'square' | 'diamond'`
    // must read through coercePrefs as a clean 8-field UserPrefs with NO `variant` property —
    // the unknown key is silently dropped on read (envelope tolerance). No STATE_VERSION bump
    // needed; the render path is always OrbShape.
    const legacySquareEnvelope: unknown = { theme: 'system', timbre: 'bowl', cue: 'labels', locale: 'en', variant: 'square' }
    const coercedSquare = coercePrefs(legacySquareEnvelope)
    expect(coercedSquare).toEqual({ ...DEFAULT_PREFS, theme: 'system', timbre: 'bowl', cue: 'labels', locale: 'en' })
    expect(Object.prototype.hasOwnProperty.call(coercedSquare, 'variant')).toBe(false)
    expect((coercedSquare as unknown as Record<string, unknown>).variant).toBeUndefined()

    const legacyDiamondEnvelope: unknown = { theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR', variant: 'diamond' }
    const coercedDiamond = coercePrefs(legacyDiamondEnvelope)
    expect(coercedDiamond).toEqual({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR' })
    expect(Object.prototype.hasOwnProperty.call(coercedDiamond, 'variant')).toBe(false)
  })

  it('does not throw when raw has prototype-polluting keys (T-25-01 mitigation)', () => {
    // Prototype-pollution mitigation: we only read four known keys, never spread `raw`
    // into an object we use as a prototype. Test that a __proto__ key in the raw doesn't
    // propagate to the returned object.
    const polluted: unknown = JSON.parse('{"theme":"system","timbre":"bowl","cue":"labels","locale":"en","__proto__":{"polluted":true}}')
    const out = coercePrefs(polluted) as unknown as Record<string, unknown>
    expect(out.polluted).toBeUndefined()
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('coerceTheme / coerceTimbre / coerceCue / coerceLocale (D-10 per-field)', () => {
  it('coerceTheme accepts all THEME_OPTIONS members and rejects invalid values', () => {
    for (const opt of THEME_OPTIONS) {
      expect(coerceTheme(opt)).toBe(opt)
    }
    expect(coerceTheme('neon')).toBe(DEFAULT_THEME)
    expect(coerceTheme(null)).toBe(DEFAULT_THEME)
    expect(coerceTheme(0)).toBe(DEFAULT_THEME)
  })

  it('coerceTimbre accepts all TIMBRE_OPTIONS members and rejects invalid values', () => {
    for (const opt of TIMBRE_OPTIONS) {
      expect(coerceTimbre(opt)).toBe(opt)
    }
    expect(coerceTimbre('trumpet')).toBe(DEFAULT_TIMBRE)
    expect(coerceTimbre(null)).toBe(DEFAULT_TIMBRE)
    expect(coerceTimbre(0)).toBe(DEFAULT_TIMBRE)
  })

  // AUDIO-02: legacy-value migration — 'chime' was the fourth timbre slot before it was
  // renamed to 'flute'. A returning user's persisted 'chime' must land on 'flute', not
  // the bowl default. 'chime' users chose the fourth slot and continue seamlessly with 'flute'.
  it("coerceTimbre('chime') → 'flute' — AUDIO-02 legacy-value migration for returning users", () => {
    expect(coerceTimbre('chime')).toBe('flute')
  })

  it("coerceTimbre passes through all current TIMBRE_OPTIONS unchanged after chime→flute rename", () => {
    expect(coerceTimbre('flute')).toBe('flute')
    expect(coerceTimbre('bowl')).toBe('bowl')
    expect(coerceTimbre('bell')).toBe('bell')
    expect(coerceTimbre('sine')).toBe('sine')
  })

  it("coerceTimbre falls safe to DEFAULT_TIMBRE for unknown strings and non-string garbage", () => {
    expect(coerceTimbre('trumpet')).toBe(DEFAULT_TIMBRE)
    expect(coerceTimbre(null)).toBe(DEFAULT_TIMBRE)
    expect(coerceTimbre(0)).toBe(DEFAULT_TIMBRE)
  })

  it("coercePrefs preserves other fields when timbre is legacy 'chime' — AUDIO-02 integration", () => {
    const result = coercePrefs({
      theme: 'dark',
      timbre: 'chime',
      cue: 'arrow',
      locale: 'pt-BR',
    })
    expect(result.timbre).toBe('flute')
    expect(result.theme).toBe('dark')
    expect(result.cue).toBe('arrow')
    expect(result.locale).toBe('pt-BR')
  })

  it('coerceCue accepts all CUE_OPTIONS members and rejects invalid values (Phase 25 T-25-01)', () => {
    for (const opt of CUE_OPTIONS) {
      expect(coerceCue(opt)).toBe(opt)
    }
    expect(coerceCue('bogus')).toBe(DEFAULT_CUE)
    expect(coerceCue(null)).toBe(DEFAULT_CUE)
    expect(coerceCue(0)).toBe(DEFAULT_CUE)
  })

  it('coerceLocale accepts all LOCALE_OPTIONS members and rejects invalid values', () => {
    for (const opt of LOCALE_OPTIONS) {
      expect(coerceLocale(opt)).toBe(opt)
    }
    expect(coerceLocale('pt_BR')).toBe(DEFAULT_LOCALE)
    expect(coerceLocale(null)).toBe(DEFAULT_LOCALE)
    expect(coerceLocale(0)).toBe(DEFAULT_LOCALE)
  })
})

describe('coerceBreathingShape (Phase 47 D-03 — alias reuse)', () => {
  // Proves alias-table single-source-of-truth: the persisted coercer delegates
  // to BREATHING_SHAPE_FLAG.parse from featureFlags.ts. Adding an alias there
  // automatically extends coverage to persisted envelopes.
  it("accepts all canonical BreathingShapeVariant values verbatim", () => {
    expect(coerceBreathingShape('orb-halo')).toBe('orb-halo')
    expect(coerceBreathingShape('minimal-rings')).toBe('minimal-rings')
    expect(coerceBreathingShape('spiritual-eye')).toBe('spiritual-eye')
  })

  it("coerces orb-halo aliases ('orb' / 'halo') to canonical", () => {
    expect(coerceBreathingShape('orb')).toBe('orb-halo')
    expect(coerceBreathingShape('halo')).toBe('orb-halo')
  })

  it("coerces minimal-rings aliases ('minimal' / 'rings') to canonical", () => {
    expect(coerceBreathingShape('minimal')).toBe('minimal-rings')
    expect(coerceBreathingShape('rings')).toBe('minimal-rings')
  })

  it("coerces spiritual-eye aliases ('kuthasta' / 'star') to canonical — D-03 proof", () => {
    expect(coerceBreathingShape('kuthasta')).toBe('spiritual-eye')
    expect(coerceBreathingShape('star')).toBe('spiritual-eye')
  })

  it("normalizes case + trim via the shared parser ('  KUTHASTA  ' → 'spiritual-eye')", () => {
    expect(coerceBreathingShape('  KUTHASTA  ')).toBe('spiritual-eye')
  })

  it("falls back to BREATHING_SHAPE_FLAG.defaultValue for garbage / null / numbers / objects", () => {
    expect(coerceBreathingShape('junk')).toBe('orb-halo')
    expect(coerceBreathingShape(null)).toBe('orb-halo')
    expect(coerceBreathingShape(undefined)).toBe('orb-halo')
    expect(coerceBreathingShape(0)).toBe('orb-halo')
    expect(coerceBreathingShape({})).toBe('orb-halo')
    expect(coerceBreathingShape([])).toBe('orb-halo')
  })
})

describe('coerceRingCue (Phase 47 D-03 — alias reuse)', () => {
  it("accepts both canonical RingCueStyle values verbatim", () => {
    expect(coerceRingCue('outer-inner')).toBe('outer-inner')
    expect(coerceRingCue('progress-arc')).toBe('progress-arc')
  })

  it("coerces outer-inner aliases ('production' / 'rings' / 'default') to canonical", () => {
    expect(coerceRingCue('production')).toBe('outer-inner')
    expect(coerceRingCue('rings')).toBe('outer-inner')
    expect(coerceRingCue('default')).toBe('outer-inner')
  })

  it("coerces progress-arc aliases ('progress' / 'arc' / 'south') to canonical", () => {
    expect(coerceRingCue('progress')).toBe('progress-arc')
    expect(coerceRingCue('arc')).toBe('progress-arc')
    expect(coerceRingCue('south')).toBe('progress-arc')
  })

  it("falls back to RING_CUE_FLAG.defaultValue for garbage / null / numbers", () => {
    expect(coerceRingCue('junk')).toBe('progress-arc')
    expect(coerceRingCue(null)).toBe('progress-arc')
    expect(coerceRingCue(undefined)).toBe('progress-arc')
    expect(coerceRingCue(42)).toBe('progress-arc')
    expect(coerceRingCue({})).toBe('progress-arc')
  })
})

describe('coerceOrbIdle', () => {
  it('accepts both canonical OrbIdleBehavior values verbatim', () => {
    expect(coerceOrbIdle('still')).toBe('still')
    expect(coerceOrbIdle('ambient')).toBe('ambient')
  })

  it("falls back to ORB_IDLE_FLAG.defaultValue for garbage / null / numbers", () => {
    expect(coerceOrbIdle('junk')).toBe('ambient')
    expect(coerceOrbIdle(null)).toBe('ambient')
    expect(coerceOrbIdle(undefined)).toBe('ambient')
    expect(coerceOrbIdle(0)).toBe('ambient')
    expect(coerceOrbIdle({})).toBe('ambient')
  })
})

describe('coerceSwitcherIcon (Phase 47 — boolean coercer)', () => {
  // Boolean coercer has THREE paths:
  //  (1) raw boolean: persisted JSON re-hydrates true/false verbatim — fast path
  //  (2) legacy string (parseQueryBoolean): tolerates hand-edited '"true"' / '"off"' envelopes
  //  (3) anything else: SWITCHER_ICON_FLAG.defaultValue (false)
  it('returns raw booleans verbatim (raw-boolean fast path)', () => {
    expect(coerceSwitcherIcon(true)).toBe(true)
    expect(coerceSwitcherIcon(false)).toBe(false)
  })

  it("parses legacy true-strings via parseQueryBoolean ('true' / 'on' / '1' / '')", () => {
    expect(coerceSwitcherIcon('true')).toBe(true)
    expect(coerceSwitcherIcon('on')).toBe(true)
    expect(coerceSwitcherIcon('1')).toBe(true)
    expect(coerceSwitcherIcon('')).toBe(true)
  })

  it("parses legacy false-strings via parseQueryBoolean ('false' / 'off' / '0')", () => {
    expect(coerceSwitcherIcon('false')).toBe(false)
    expect(coerceSwitcherIcon('off')).toBe(false)
    expect(coerceSwitcherIcon('0')).toBe(false)
  })

  it("falls back to SWITCHER_ICON_FLAG.defaultValue (false) for unparseable strings", () => {
    expect(coerceSwitcherIcon('bogus')).toBe(false)
  })

  it("falls back to false for non-string, non-boolean inputs (null / undefined / numbers / objects)", () => {
    expect(coerceSwitcherIcon(null)).toBe(false)
    expect(coerceSwitcherIcon(undefined)).toBe(false)
    expect(coerceSwitcherIcon(0)).toBe(false)
    expect(coerceSwitcherIcon(1)).toBe(false)
    expect(coerceSwitcherIcon({})).toBe(false)
    expect(coerceSwitcherIcon([])).toBe(false)
  })
})

describe('coerceBypassSilentMode (Phase 49.1 D-05 — boolean coercer, default true)', () => {
  // Boolean coercer has THREE paths:
  //  (1) raw boolean: persisted JSON re-hydrates true/false verbatim — fast path
  //  (2) legacy string (parseQueryBoolean): tolerates hand-edited '"true"' / '"off"' envelopes
  //  (3) anything else: BYPASS_SILENT_MODE_FLAG.defaultValue (true)
  it('returns raw booleans verbatim (raw-boolean fast path)', () => {
    expect(coerceBypassSilentMode(true)).toBe(true)
    expect(coerceBypassSilentMode(false)).toBe(false)
  })

  it("parses legacy true-strings via parseQueryBoolean ('true' / 'on' / '1' / '')", () => {
    expect(coerceBypassSilentMode('true')).toBe(true)
    expect(coerceBypassSilentMode('on')).toBe(true)
    expect(coerceBypassSilentMode('1')).toBe(true)
    expect(coerceBypassSilentMode('')).toBe(true)
  })

  it("parses legacy false-strings via parseQueryBoolean ('false' / 'off' / '0')", () => {
    expect(coerceBypassSilentMode('false')).toBe(false)
    expect(coerceBypassSilentMode('off')).toBe(false)
    expect(coerceBypassSilentMode('0')).toBe(false)
  })

  it("falls back to BYPASS_SILENT_MODE_FLAG.defaultValue (true) for unparseable strings", () => {
    expect(coerceBypassSilentMode('bogus')).toBe(true) // default true (note: flipped from switcherIcon's false)
  })

  it("falls back to true for non-string, non-boolean inputs (null / undefined / numbers / objects)", () => {
    expect(coerceBypassSilentMode(null)).toBe(true)
    expect(coerceBypassSilentMode(undefined)).toBe(true)
    expect(coerceBypassSilentMode(0)).toBe(true)
    expect(coerceBypassSilentMode(1)).toBe(true)
    expect(coerceBypassSilentMode({})).toBe(true)
    expect(coerceBypassSilentMode([])).toBe(true)
  })
})

describe('coercePrefs corrupt-field tolerance (Phase 47 PREFS-04)', () => {
  // Per-field non-throwing coerce-and-fallback: a single corrupt field falls back
  // to the per-flag default; the other 8 fields are preserved.
  it("breathingShape: 'junk' → 'orb-halo' default; other fields preserved", () => {
    const out = coercePrefs({
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
      breathingShape: 'junk',
      ringCue: 'outer-inner', orbIdle: 'still', switcherIcon: true, bypassSilentMode: true,
    })
    expect(out.breathingShape).toBe('orb-halo')
    expect(out.theme).toBe('dark')
    expect(out.ringCue).toBe('outer-inner')
    expect(out.orbIdle).toBe('still')
    expect(out.switcherIcon).toBe(true)
    expect(out.bypassSilentMode).toBe(true)
  })

  it("ringCue: 'junk' → 'progress-arc' default; other fields preserved", () => {
    const out = coercePrefs({
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
      breathingShape: 'spiritual-eye', ringCue: 'junk',
      orbIdle: 'still', switcherIcon: true, bypassSilentMode: true,
    })
    expect(out.ringCue).toBe('progress-arc')
    expect(out.breathingShape).toBe('spiritual-eye')
    expect(out.bypassSilentMode).toBe(true)
  })

  it("orbIdle: 'junk' → 'ambient' default; other fields preserved", () => {
    const out = coercePrefs({
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
      breathingShape: 'spiritual-eye', ringCue: 'outer-inner',
      orbIdle: 'junk', switcherIcon: true, bypassSilentMode: true,
    })
    expect(out.orbIdle).toBe('ambient')
    expect(out.switcherIcon).toBe(true)
    expect(out.bypassSilentMode).toBe(true)
  })

  it("switcherIcon: garbage number → false default; other fields preserved", () => {
    const out = coercePrefs({
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
      breathingShape: 'spiritual-eye', ringCue: 'outer-inner',
      orbIdle: 'still', switcherIcon: 42, bypassSilentMode: true,
    })
    expect(out.switcherIcon).toBe(false)
    expect(out.orbIdle).toBe('still')
    expect(out.bypassSilentMode).toBe(true)
  })

  it("bypassSilentMode: 'junk' → true default (D-05); other fields preserved", () => {
    const out = coercePrefs({
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
      breathingShape: 'spiritual-eye', ringCue: 'outer-inner',
      orbIdle: 'still', switcherIcon: true, bypassSilentMode: 'junk',
    })
    expect(out.bypassSilentMode).toBe(true) // corrupt-field falls back to true (bypassSilentMode default)
    expect(out.orbIdle).toBe('still')
    expect(out.switcherIcon).toBe(true)
  })

  it("pre-Phase-47 envelope (4 keys only) coerces the 5 new keys to per-flag defaults (PREFS-03)", () => {
    // A returning user from a pre-Phase-47 build has 4 prefs keys — the 5 new
    // keys are undefined and each coercer falls back to the per-flag default.
    // Returning users see the production defaults.
    const out = coercePrefs({ theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR' })
    expect(out).toEqual({
      ...DEFAULT_PREFS,
      theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR',
    })
    expect(out.breathingShape).toBe('orb-halo')
    expect(out.ringCue).toBe('progress-arc')
    expect(out.orbIdle).toBe('ambient')
    expect(out.switcherIcon).toBe(false)
    expect(out.bypassSilentMode).toBe(true)
  })
})

describe('coercePrefs alias-reuse — persisted kuthasta round-trips to spiritual-eye (Phase 47 D-03)', () => {
  it("envelope { breathingShape: 'kuthasta' } coerces to UserPrefs.breathingShape === 'spiritual-eye'", () => {
    // Integration assertion that catches alias-table drift between BREATHING_SHAPE_FLAG.parse
    // and the persisted coercer. If a future refactor duplicates the alias table in
    // coerceBreathingShape, this test stays green; if it duplicates the alias table OUT OF SYNC
    // (e.g., drops 'kuthasta'), this test goes red.
    const envelope = {
      theme: 'system', timbre: 'bowl', cue: 'arrow', locale: 'en',
      breathingShape: 'kuthasta',
    }
    expect(coercePrefs(envelope).breathingShape).toBe('spiritual-eye')
  })
})

describe('loadPrefs / savePrefs round-trip', () => {
  it('returns DEFAULT_PREFS when nothing is stored (LOCL-01)', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('round-trips a valid UserPrefs object (including cue field)', () => {
    const next: UserPrefs = { ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'nose', locale: 'pt-BR' }
    savePrefs(next)
    expect(loadPrefs()).toEqual(next)
  })

  it('round-trips a full UserPrefs with every non-default flag set', () => {
    // Full-fidelity round-trip: every new field carries a non-default value so the
    // assertion fails if any coercer, the JSON re-hydration, or the envelope-merge drops a value.
    const fullPrefs: UserPrefs = {
      theme: 'dark', timbre: 'bell', cue: 'nose', locale: 'pt-BR',
      breathingShape: 'spiritual-eye',
      ringCue: 'outer-inner',
      orbIdle: 'still',
      switcherIcon: true,
      bypassSilentMode: false, // non-default (default is true)
      advanced: true,          // non-default (default is false)
    }
    savePrefs(fullPrefs)
    expect(loadPrefs()).toEqual(fullPrefs)
  })

  it('DEFAULT_PREFS.cue === "arrow" (quick task 260519-9mi)', () => {
    expect(DEFAULT_PREFS.cue).toBe('arrow')
  })

  it('preserves settings, mute, and stats fields when saving prefs (envelope merge)', () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1,
      settings: { bpm: 4, ratio: '40:60', durationMinutes: 5 },
      mute: true,
      stats: { totalSessions: 3, totalElapsedSeconds: 120, lastSessionAtMs: 1000, lastSessionDurationSeconds: 60 },
    }))
    savePrefs({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'arrow', locale: 'pt-BR' })
    // Reason: STATE_KEY is always present after savePrefs; non-null asserted by storage contract.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const raw = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as Record<string, unknown>
    expect(raw).toMatchObject({ settings: { bpm: 4 }, mute: true, stats: { totalSessions: 3 } })
  })

  it('does not throw when underlying setItem throws (D-16)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => { savePrefs({ ...DEFAULT_PREFS, theme: 'dark', timbre: 'bell', cue: 'labels', locale: 'pt-BR' }) }).not.toThrow()
  })

  it('falls back to defaults when stored JSON is corrupt (D-17)', () => {
    window.localStorage.setItem(STATE_KEY, '{not-json')
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('coerceAdvanced (precise-control opt-in, default false)', () => {
  it('returns raw booleans verbatim', () => {
    expect(coerceAdvanced(true)).toBe(true)
    expect(coerceAdvanced(false)).toBe(false)
  })

  it('falls back to false for non-boolean inputs (strings / null / numbers / objects)', () => {
    expect(coerceAdvanced('true')).toBe(false)
    expect(coerceAdvanced(null)).toBe(false)
    expect(coerceAdvanced(undefined)).toBe(false)
    expect(coerceAdvanced(1)).toBe(false)
    expect(coerceAdvanced({})).toBe(false)
  })
})

describe('DEFAULT_PREFS shape', () => {
  // The field count guards against adding a pref field without a default. The
  // individual coercer defaults and the kuthasta alias round-trip are covered by
  // their own describe blocks above.
  it('DEFAULT_PREFS has the 10 contracted fields with their defaults', () => {
    expect(DEFAULT_PREFS.breathingShape).toBe('orb-halo')
    expect(DEFAULT_PREFS.ringCue).toBe('progress-arc')
    expect(DEFAULT_PREFS.orbIdle).toBe('ambient')
    expect(DEFAULT_PREFS.switcherIcon).toBe(false)
    expect(DEFAULT_PREFS.bypassSilentMode).toBe(true)
    expect(DEFAULT_PREFS.advanced).toBe(false)
    expect(Object.keys(DEFAULT_PREFS)).toHaveLength(10)
  })
})

describe('THM-05 forward-compat (CONTEXT D-02)', () => {
  // A returning user with deprecated persisted theme values ('moss' | 'slate' | 'dusk')
  // reads through coercePrefs as 'system'; the next savePrefs overwrites the on-disk value.
  // No STATE_VERSION bump needed — per-field coercion carries the value until savePrefs.

  it('coerces deprecated persisted theme values to "system" on read — THM-05 (CONTEXT D-02)', () => {
    for (const deprecated of ['moss', 'slate', 'dusk']) {
      window.localStorage.setItem(STATE_KEY, JSON.stringify({
        version: 1,
        prefs: { theme: deprecated, timbre: 'bowl', cue: 'arrow', locale: 'en' },
      }))
      expect(loadPrefs().theme).toBe('system')
    }
  })

  it('re-persists deprecated theme as "system" on the next savePrefs call — THM-05 round-trip (CONTEXT D-02)', () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1,
      prefs: { theme: 'moss', timbre: 'bowl', cue: 'arrow', locale: 'en' },
    }))
    const loaded = loadPrefs()
    expect(loaded.theme).toBe('system')
    savePrefs(loaded)
    // Reason: STATE_KEY is always present after savePrefs; non-null asserted by storage contract.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const raw = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as { prefs: { theme: string } }
    expect(raw.prefs.theme).toBe('system')
  })
})
