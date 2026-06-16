// src/storage/prefs.ts
//
// Per-field coerce-and-fallback for user prefs. Coercers are NON-THROWING
// (mirrors coerceSettings in src/storage/settings.ts). Per-field policy: a
// single drifted dimension does NOT discard the other three.
//
// Legacy migration policy (per AUDIO-02 precedent):
//   - DELETED enum value -> explicit remap in the coercer's legacy table
//     (e.g. LEGACY_TIMBRE_REMAP below: chime -> flute). The remap is
//     load-bearing forever for v1.x envelopes.
//   - RENAMED default only (enum value still valid) -> no migration; an
//     existing user's explicit choice is preserved. The default change only
//     affects users who have not yet made an explicit choice.
//   - STRUCTURAL field move (rename, nest, split) -> STATE_VERSION bump +
//     migrateEnvelope ladder step in storage.ts.

import {
  DEFAULT_THEME,
  DEFAULT_TIMBRE,
  DEFAULT_CUE,
  DEFAULT_LOCALE,
  isValidTheme,
  isValidTimbre,
  isValidCue,
  isValidLocale,
  type ThemeId,
  type TimbreId,
  type CueStyleId,
  type LocaleId,
} from '../domain/settings'

import { asRecord, readEnvelope, writeEnvelope, type StorageDeps } from './storage'

import {
  BREATHING_SHAPE_FLAG,
  RING_CUE_FLAG,
  ORB_IDLE_FLAG,
  SWITCHER_ICON_FLAG,
  BYPASS_SILENT_MODE_FLAG,
  parseQueryBoolean,
  type BreathingShapeVariant,
  type RingCueStyle,
  type OrbIdleBehavior,
} from '../featureFlags'

export interface UserPrefs {
  theme: ThemeId
  timbre: TimbreId
  cue: CueStyleId
  locale: LocaleId
  breathingShape: BreathingShapeVariant
  ringCue: RingCueStyle
  orbIdle: OrbIdleBehavior
  switcherIcon: boolean
  bypassSilentMode: boolean  // default true preserves the no-silent-mode bypass users rely on
  advanced: boolean          // opt-in precise-control mode (free-set velocity/ratio sliders)
}

export const DEFAULT_PREFS: UserPrefs = {
  theme: DEFAULT_THEME,
  timbre: DEFAULT_TIMBRE,
  cue: DEFAULT_CUE,
  locale: DEFAULT_LOCALE,
  breathingShape: BREATHING_SHAPE_FLAG.defaultValue,
  ringCue: RING_CUE_FLAG.defaultValue,
  orbIdle: ORB_IDLE_FLAG.defaultValue,
  switcherIcon: SWITCHER_ICON_FLAG.defaultValue,
  bypassSilentMode: BYPASS_SILENT_MODE_FLAG.defaultValue, // true — see UserPrefs.bypassSilentMode
  advanced: false,
}

export function coerceTheme(raw: unknown): ThemeId {
  return isValidTheme(raw) ? raw : DEFAULT_THEME
}

// Legacy-value migration table: deleted enum values that must remap to a current
// TimbreId on read. The remap is load-bearing for every returning user whose
// on-disk envelope still carries a deleted value — see the policy comment at the
// top of this file for the deletion/rename distinction.
//
// Contract: this table MUST NOT be deleted (and entries MUST NOT be removed)
// without a STATE_VERSION bump + an explicit migrateEnvelope ladder step that
// rewrites the deleted values on every existing envelope. The remap is treated
// as transient (re-run on every read) because coercers are non-throwing per
// field, but it is structurally a permanent contract for the lifetime of v1.x
// data. Tests in prefs.test.ts exercise each entry; do not silently shrink it.
//
// Entries:
//   - 'chime' → 'flute' (fourth timbre slot was renamed)
export const LEGACY_TIMBRE_REMAP: Readonly<Record<string, TimbreId>> = Object.freeze({
  chime: 'flute',
})

export function coerceTimbre(raw: unknown): TimbreId {
  if (typeof raw === 'string') {
    const remapped = LEGACY_TIMBRE_REMAP[raw]
    if (remapped !== undefined) return remapped
  }
  return isValidTimbre(raw) ? raw : DEFAULT_TIMBRE
}

export function coerceCue(raw: unknown): CueStyleId {
  return isValidCue(raw) ? raw : DEFAULT_CUE
}

export function coerceLocale(raw: unknown): LocaleId {
  return isValidLocale(raw) ? raw : DEFAULT_LOCALE
}

// Parser reused from featureFlags.ts so the alias table stays in one place.
export function coerceBreathingShape(raw: unknown): BreathingShapeVariant {
  if (typeof raw !== 'string') return BREATHING_SHAPE_FLAG.defaultValue
  return BREATHING_SHAPE_FLAG.parse(raw) ?? BREATHING_SHAPE_FLAG.defaultValue
}

// Parser reused from featureFlags.ts so the alias table stays in one place.
export function coerceRingCue(raw: unknown): RingCueStyle {
  if (typeof raw !== 'string') return RING_CUE_FLAG.defaultValue
  return RING_CUE_FLAG.parse(raw) ?? RING_CUE_FLAG.defaultValue
}

// Parser reused from featureFlags.ts so the alias table stays in one place.
export function coerceOrbIdle(raw: unknown): OrbIdleBehavior {
  if (typeof raw !== 'string') return ORB_IDLE_FLAG.defaultValue
  return ORB_IDLE_FLAG.parse(raw) ?? ORB_IDLE_FLAG.defaultValue
}

// Boolean coercer: parser reused from featureFlags.ts so the alias table stays
// in one place. Persisted JSON re-hydrates true/false as actual booleans (fast
// path), then falls through to parseQueryBoolean for legacy/hand-edited string
// envelopes.
export function coerceSwitcherIcon(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const parsed = parseQueryBoolean(raw)
    if (parsed !== null) return parsed
  }
  return SWITCHER_ICON_FLAG.defaultValue
}

// Boolean coercer: parser reused from featureFlags.ts so the alias table stays
// in one place. Persisted JSON re-hydrates true/false as actual booleans (fast
// path), then falls through to parseQueryBoolean for legacy/hand-edited string
// envelopes. Default is true — preserves the no-silent-mode bypass users rely on.
export function coerceBypassSilentMode(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const parsed = parseQueryBoolean(raw)
    if (parsed !== null) return parsed
  }
  return BYPASS_SILENT_MODE_FLAG.defaultValue
}

// Not flag-backed (no query override), so this is a plain boolean coercer with no
// legacy-string path — a brand-new field has no hand-edited string envelopes to tolerate.
export function coerceAdvanced(raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : DEFAULT_PREFS.advanced
}

export function coercePrefs(raw: unknown): UserPrefs {
  // Prototype-pollution mitigation: we only read ten known keys from the
  // guarded record; `raw` is never spread into a prototype-accessible object.
  const r = asRecord(raw)
  return {
    theme:            coerceTheme(r.theme),
    timbre:           coerceTimbre(r.timbre),
    cue:              coerceCue(r.cue),
    locale:           coerceLocale(r.locale),
    breathingShape:   coerceBreathingShape(r.breathingShape),
    ringCue:          coerceRingCue(r.ringCue),
    orbIdle:          coerceOrbIdle(r.orbIdle),
    switcherIcon:     coerceSwitcherIcon(r.switcherIcon),
    bypassSilentMode: coerceBypassSilentMode(r.bypassSilentMode),
    advanced:         coerceAdvanced(r.advanced),
  }
}

export function loadPrefs(deps: StorageDeps = {}): UserPrefs {
  return coercePrefs(readEnvelope(deps).prefs)
}

export function savePrefs(prefs: UserPrefs, deps: StorageDeps = {}): void {
  const env = readEnvelope(deps)
  writeEnvelope({ ...env, prefs }, deps)
}
