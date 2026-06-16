import { nearestOption } from './settings'

export type OmLength = 'fast' | 'medium' | 'slow'

export const OM_LENGTH_OPTIONS = ['fast', 'medium', 'slow'] as const satisfies readonly OmLength[]

// Seconds-per-OM preset for each named speed — the discrete values shown when
// advanced is off. The engine reads NaviKriyaSettings.omSeconds directly; this
// map only builds the picker options and seeds the default.
export const NK_OM_SECONDS: Record<OmLength, number> = {
  fast: 1.75,
  medium: 2.16,
  slow: 3.0,
}

// OM duration bounds (advanced free-set, Q3). Right = slower. The three presets
// above all sit inside this range.
export const OM_SECONDS_MIN = 1.0
export const OM_SECONDS_MAX = 4.0

// Selectable round counts for the Navi Kriya settings stepper.
export const NK_ROUNDS_OPTIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// NK-04: selectable front OM counts. Entries are multiples of 100, minimum 100.
// Every entry is also a multiple of 4 so backCount = frontCount / 4 is never
// fractional — paired with isValidFrontCount.
export const NK_FRONT_COUNT_OPTIONS: readonly number[] = [100, 200, 300, 400, 500]

export interface NaviKriyaSettings {
  frontCount: number   // base front OM count; backCount = frontCount / 4; must be multiple of 4
  omSeconds: number    // seconds per OM (1.0–4.0); engine reads this directly
  rounds: number       // integer >= 1; default 3
  perOmCue: boolean    // audible per-OM tick; default true
}

export const DEFAULT_NK_SETTINGS: NaviKriyaSettings = {
  frontCount: 100,
  omSeconds: NK_OM_SECONDS.medium,
  rounds: 3,
  perOmCue: true,
}

// isValidFrontCount: checks typeof number, Number.isFinite, Number.isInteger, v > 0,
// AND v % 4 === 0 — the multiple-of-4 invariant ensures backCount = frontCount / 4
// is never fractional.
export function isValidFrontCount(v: unknown): v is number {
  return typeof v === 'number'
    && Number.isFinite(v)
    && Number.isInteger(v)
    && v > 0
    && v % 4 === 0
}

export function isValidOmSeconds(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= OM_SECONDS_MIN && v <= OM_SECONDS_MAX
}

// Snaps a free-set omSeconds back to the nearest named preset (fast/medium/slow).
// Returns the SAME reference when already on a preset.
export function snapNaviKriyaSettingsToPresets(s: NaviKriyaSettings): NaviKriyaSettings {
  const presets = OM_LENGTH_OPTIONS.map((l) => NK_OM_SECONDS[l])
  const omSeconds = nearestOption(presets, s.omSeconds)
  return omSeconds === s.omSeconds ? s : { ...s, omSeconds }
}

// isValidRounds: checks typeof number, Number.isFinite, Number.isInteger, v >= 1
export function isValidRounds(v: unknown): v is number {
  return typeof v === 'number'
    && Number.isFinite(v)
    && Number.isInteger(v)
    && v >= 1
}
