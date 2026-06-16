export type RatioLabel = '50:50' | '40:60' | '30:70' | '20:80'
export type DurationOption = number | 'open-ended'

// Stretch stage durations are minute-based: Warm-up (initial-BPM hold), Ramp
// (the BPM walk-down), and Cool-down (target-BPM hold). The structural minimum
// total is 2 + 2 + 2 = 6 min, so no separate "session long enough" gate is needed.
export type WarmUpMinutes = 2 | 3 | 4 | 5 | 10

export const WARMUP_MINUTES_OPTIONS = [2, 3, 4, 5, 10] as const satisfies readonly WarmUpMinutes[]

export type CoolDownMinutes = 2 | 3 | 4 | 5 | 10 | 15 | 20 | 25 | 30 | 'open-ended'

export const COOLDOWN_OPTIONS = [2, 3, 4, 5, 10, 15, 20, 25, 30, 'open-ended'] as const satisfies readonly CoolDownMinutes[]

export const RAMP_DURATION_OPTIONS = [2, 3, 4, 5, 10] as const satisfies readonly number[]

// SessionSettings is standard-only — 3 fields (bpm, ratio, durationMinutes).
export interface SessionSettings {
  bpm: number
  ratio: RatioLabel
  durationMinutes: DurationOption
}

// StretchSettings is a standalone type — ratio + the five ramp fields.
// durationMinutes is NOT stored here (it is computed from the ramp table).
export interface StretchSettings {
  ratio: RatioLabel
  targetRatio: RatioLabel
  initialBpm: number
  targetBpm: number
  warmUpMinutes: WarmUpMinutes
  rampDurationMinutes: number
  coolDownMinutes: CoolDownMinutes
}

// HRV BPM bounds (advanced free-set, Q2). BPM_OPTIONS below are the discrete
// presets shown when advanced is off and span exactly this range.
export const BPM_MIN = 1
export const BPM_MAX = 7

export const BPM_OPTIONS = [
  1,
  1.5,
  2,
  2.5,
  3,
  3.5,
  4,
  4.5,
  5,
  5.5,
  6,
  6.5,
  7,
] as const satisfies readonly number[]

// STRETCH_INITIAL_BPM_OPTIONS: BPM_OPTIONS filtered to >= 1.5 so targetBpm always has
// at least one valid option below initialBpm (prevents empty targetBpm picker)
export const STRETCH_INITIAL_BPM_OPTIONS: readonly number[] = (BPM_OPTIONS as readonly number[]).filter(
  (v) => v >= 1.5,
)

export const RATIO_OPTIONS = ['50:50', '40:60', '30:70', '20:80'] as const satisfies readonly RatioLabel[]

// Inhale/exhale split (percent of cycle) for each ratio. Single source of truth —
// consumed by createBreathingPlan and buildStretchSegments.
export const RATIO_PARTS: Record<RatioLabel, { readonly inhale: number; readonly exhale: number }> = {
  '50:50': { inhale: 50, exhale: 50 },
  '40:60': { inhale: 40, exhale: 60 },
  '30:70': { inhale: 30, exhale: 70 },
  '20:80': { inhale: 20, exhale: 80 },
}

export const DURATION_OPTIONS = [
  5,
  10,
  15,
  20,
  25,
  30,
  35,
  40,
  45,
  50,
  55,
  60,
  'open-ended',
] as const satisfies readonly DurationOption[]

export const DEFAULT_SETTINGS: SessionSettings = {
  bpm: 5.5,
  ratio: '40:60',
  durationMinutes: 10,
}

// DEFAULT_STRETCH_SETTINGS: the per-field stretch defaults referenced by the
// storage coercer. Warm-up 5 + Ramp 5 + Cool-down 5 = 15-minute computed total.
// ratio is consumed by buildStretchSegments internally.
export const DEFAULT_STRETCH_SETTINGS: StretchSettings = {
  ratio: '40:60',
  targetRatio: '40:60',
  initialBpm: 5.5,
  targetBpm: 4.5,
  warmUpMinutes: 5,
  coolDownMinutes: 5,
  rampDurationMinutes: 5,
}

export function getNextDurationOption(duration: DurationOption): DurationOption | undefined {
  const currentIndex = (DURATION_OPTIONS as readonly DurationOption[]).indexOf(duration)
  return currentIndex === -1
    ? undefined
    : (DURATION_OPTIONS as readonly DurationOption[])[currentIndex + 1]
}

export function getStretchTargetBpmOptions(initialBpm: number): readonly number[] {
  return (BPM_OPTIONS as readonly number[]).filter((value) => value < initialBpm)
}

export function getClosestLowerStretchTargetBpm(initialBpm: number): number {
  const options = getStretchTargetBpmOptions(initialBpm)
  const closest = options[options.length - 1]
  if (closest === undefined) {
    throw new RangeError(
      `No BPM option is strictly below initialBpm=${String(initialBpm)}`,
    )
  }
  return closest
}

export function getStretchSettingsWithInitialBpm(
  settings: StretchSettings,
  initialBpm: number,
): StretchSettings {
  if (settings.targetBpm >= initialBpm) {
    return {
      ...settings,
      initialBpm,
      targetBpm: getClosestLowerStretchTargetBpm(initialBpm),
    }
  }

  return { ...settings, initialBpm }
}

// Customization enum surfaces — predicates are stable; consumers add UI/CSS/audio
// wiring without editing the domain types.

export type ThemeId = 'light' | 'dark' | 'system'

export const THEME_OPTIONS = ['light', 'dark', 'system'] as const satisfies readonly ThemeId[]

export function isValidTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_OPTIONS as readonly string[]).includes(v)
}

export const DEFAULT_THEME: ThemeId = 'system'

export type TimbreId = 'bowl' | 'bell' | 'sine' | 'flute'

export const TIMBRE_OPTIONS = ['bowl', 'bell', 'sine', 'flute'] as const satisfies readonly TimbreId[]

export function isValidTimbre(v: unknown): v is TimbreId {
  return typeof v === 'string' && (TIMBRE_OPTIONS as readonly string[]).includes(v)
}

export const DEFAULT_TIMBRE: TimbreId = 'sine'

export type CueStyleId = 'labels' | 'arrow' | 'nose'

export const CUE_OPTIONS = ['labels', 'arrow', 'nose'] as const satisfies readonly CueStyleId[]

export function isValidCue(v: unknown): v is CueStyleId {
  return typeof v === 'string' && (CUE_OPTIONS as readonly string[]).includes(v)
}

export const DEFAULT_CUE: CueStyleId = 'arrow'

export type LocaleId = 'en' | 'pt-BR'

export const LOCALE_OPTIONS = ['en', 'pt-BR'] as const satisfies readonly LocaleId[]

export function isValidLocale(v: unknown): v is LocaleId {
  return typeof v === 'string' && (LOCALE_OPTIONS as readonly string[]).includes(v)
}

export const DEFAULT_LOCALE: LocaleId = 'en'

export function isValidBpm(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= BPM_MIN && v <= BPM_MAX
}

export function isValidRatio(v: unknown): v is RatioLabel {
  return typeof v === 'string' && (RATIO_OPTIONS as readonly string[]).includes(v)
}

export function isValidDuration(v: unknown): v is DurationOption {
  if (v === 'open-ended') return true
  return typeof v === 'number'
    && Number.isFinite(v)
    && (DURATION_OPTIONS as readonly DurationOption[]).includes(v)
}

export function isValidWarmUp(v: unknown): v is WarmUpMinutes {
  return typeof v === 'number'
    && Number.isFinite(v)
    && (WARMUP_MINUTES_OPTIONS as readonly number[]).includes(v)
}

export function isValidCoolDown(v: unknown): v is CoolDownMinutes {
  if (v === 'open-ended') return true
  return typeof v === 'number'
    && Number.isFinite(v)
    && (COOLDOWN_OPTIONS as readonly unknown[]).includes(v)
}

export function isValidRampDuration(v: unknown): v is number {
  return typeof v === 'number'
    && Number.isFinite(v)
    && (RAMP_DURATION_OPTIONS as readonly number[]).includes(v)
}

// validateSettings is standard-only — 3 fields, no mode check.
export function validateSettings(settings: SessionSettings): SessionSettings {
  if (!isValidBpm(settings.bpm)) {
    throw new RangeError(`Unsupported BPM: ${String(settings.bpm)}`)
  }

  if (!isValidRatio(settings.ratio)) {
    // Reason: the user-defined predicate `isValidRatio: (v: unknown): v is RatioLabel`
    // narrows `settings.ratio: RatioLabel` to `never` in the false branch. `${settings.ratio}`
    // Reason: the user-defined predicate `isValidRatio: (v: unknown): v is RatioLabel`
    // narrows `settings.ratio: RatioLabel` to `never` in the false branch. `${settings.ratio}`
    // is preserved verbatim so the runtime string remains correct.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new RangeError(`Unsupported ratio: ${settings.ratio}`)
  }

  if (!isValidDuration(settings.durationMinutes)) {
    throw new RangeError(`Unsupported duration: ${String(settings.durationMinutes)}`)
  }

  return { ...settings }
}

// validateStretchSettings receives a StretchSettings (not SessionSettings).
export function validateStretchSettings(settings: StretchSettings): StretchSettings {
  if (!isValidRatio(settings.ratio)) {
    // Reason: the user-defined predicate `isValidRatio: (v: unknown): v is RatioLabel`
    // narrows `settings.ratio: RatioLabel` to `never` in the false branch. `${settings.ratio}`
    // is preserved verbatim so the runtime string remains correct.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new RangeError(`Unsupported ratio: ${settings.ratio}`)
  }

  // targetRatio has no ordering constraint relative to the start ratio — it may
  // carry more, less, or equal inhale weight. Only the label itself is validated.
  if (!isValidRatio(settings.targetRatio)) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new RangeError(`Unsupported targetRatio: ${settings.targetRatio}`)
  }

  if (!isValidBpm(settings.initialBpm)) {
    throw new RangeError(`Unsupported initialBpm: ${String(settings.initialBpm)}`)
  }

  if (!isValidBpm(settings.targetBpm) || settings.targetBpm >= settings.initialBpm) {
    throw new RangeError(`Unsupported targetBpm: ${String(settings.targetBpm)}`)
  }

  if (!isValidWarmUp(settings.warmUpMinutes)) {
    throw new RangeError(`Unsupported warmUpMinutes: ${String(settings.warmUpMinutes)}`)
  }

  if (!isValidCoolDown(settings.coolDownMinutes)) {
    throw new RangeError(`Unsupported coolDownMinutes: ${String(settings.coolDownMinutes)}`)
  }

  if (!isValidRampDuration(settings.rampDurationMinutes)) {
    throw new RangeError(`Unsupported rampDurationMinutes: ${String(settings.rampDurationMinutes)}`)
  }

  return { ...settings }
}
