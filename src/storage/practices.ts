// src/storage/practices.ts
//
// Per-practice persistence layer. The v2 envelope holds a `practices` map —
// { resonant, naviKriya, stretch } — each carrying its own settings + stats
// slice, plus a top-level `activePractice` id.
//
// Coercers are NON-THROWING and prototype-pollution-safe, mirroring
// prefs.ts / settings.ts: a single drifted field never discards the rest of the
// envelope. `raw` is never spread into a prototype-accessible object — only named
// keys are read from a guarded Record (ASVS V5).

import { coerceSettings } from './settings'
import { coerceStats, COUNT_THRESHOLD_MS, ZERO_STATS, type PersistedStats } from './stats'
import { asRecord, readEnvelope, writeEnvelope, type StorageDeps } from './storage'
import type { SessionSettings } from '../domain/settings'
import {
  DEFAULT_STRETCH_SETTINGS,
  STRETCH_INITIAL_BPM_OPTIONS,
  isValidInhaleShare,
  isValidBpm,
  isValidWarmUp,
  isValidCoolDown,
  isValidRampDuration,
  type StretchSettings,
} from '../domain/settings'
import {
  DEFAULT_NK_SETTINGS,
  NK_FRONT_COUNT_OPTIONS,
  isValidOmLength,
  isValidRounds,
  type NaviKriyaSettings,
} from '../domain/naviKriyaSettings'

export type PracticeId = 'resonant' | 'stretch' | 'naviKriya'

export interface PracticeSlice<S> {
  settings: S
  stats: PersistedStats
}

export interface PracticeMap {
  resonant: PracticeSlice<SessionSettings>
  stretch: PracticeSlice<StretchSettings>
  naviKriya: PracticeSlice<NaviKriyaSettings>
}

export function coerceActivePractice(raw: unknown): PracticeId {
  // Only the three known ids survive; anything else (garbage string, null, number)
  // falls back to 'resonant' — the default practice.
  return raw === 'resonant' || raw === 'stretch' || raw === 'naviKriya' ? raw : 'resonant'
}

// snapToNearestOption: returns the NK_FRONT_COUNT_OPTIONS entry nearest to
// `value`. Ties (equidistant between two adjacent options) round UP to the
// higher option. Values below the minimum option snap up to the minimum.
function snapToNearestOption(value: number): number {
  const firstOption = NK_FRONT_COUNT_OPTIONS[0]
  if (firstOption === undefined) {
    // Strict-mode artifact: NK_FRONT_COUNT_OPTIONS is non-empty by construction
    // (domain literal in src/domain/naviKriyaSettings.ts). The guard satisfies
    // noUncheckedIndexedAccess; the branch is unreachable at runtime unless the
    // domain literal is emptied (a deliberate refactor).
    return DEFAULT_NK_SETTINGS.frontCount
  }
  let best = firstOption
  let bestDist = Math.abs(value - best)
  for (const option of NK_FRONT_COUNT_OPTIONS) {
    const dist = option - value  // signed: negative means option < value
    const absDist = Math.abs(dist)
    // Prefer the higher option on a tie (dist >= 0 means option >= value).
    if (absDist < bestDist || (absDist === bestDist && dist >= 0)) {
      best = option
      bestDist = absDist
    }
  }
  return best
}

export function coerceNaviKriyaSettings(raw: unknown): NaviKriyaSettings {
  const r = asRecord(raw)
  // frontCount: a tampered non-multiple-of-4 value is rounded DOWN to the
  // nearest multiple of 4 so backCount = frontCount / 4 is never fractional.
  // A non-finite / non-positive value (or one that rounds to 0) falls back to
  // the default.
  // Then snap to the nearest NK_FRONT_COUNT_OPTIONS entry so the SettingsStepper
  // always has a valid selectedIndex. Ties round UP. Values below the minimum
  // snap up to the minimum (100). Without this snap, a returning user with a
  // stale persisted frontCount not in the current options would see index -1
  // in the stepper, disabling both +/- buttons.
  let frontCount = DEFAULT_NK_SETTINGS.frontCount
  const fc = r.frontCount
  if (typeof fc === 'number' && Number.isFinite(fc) && fc > 0) {
    const rounded = Math.floor(fc / 4) * 4
    if (rounded > 0) frontCount = snapToNearestOption(rounded)
  }
  return {
    frontCount,
    omLength: isValidOmLength(r.omLength) ? r.omLength : DEFAULT_NK_SETTINGS.omLength,
    rounds:   isValidRounds(r.rounds)     ? r.rounds   : DEFAULT_NK_SETTINGS.rounds,
    perOmCue: typeof r.perOmCue === 'boolean' ? r.perOmCue : DEFAULT_NK_SETTINGS.perOmCue,
  }
}

// coerceStretchSettings uses asRecord guard for prototype-pollution safety;
// per-field non-throwing fallback means one drifted field never discards the rest.
//
// Enforces the cross-field invariant targetBpm < initialBpm (parity with
// validateStretchSettings). A persisted slice that violates it falls back to
// DEFAULT_STRETCH_SETTINGS for BOTH BPM fields so the ramp engine never receives
// an inverted or zero-span ramp. initialBpm is restricted to
// STRETCH_INITIAL_BPM_OPTIONS (>= 1.5) so a coerced initialBpm can never
// collapse the targetBpm picker to an empty option list.
export function coerceStretchSettings(raw: unknown): StretchSettings {
  const r = asRecord(raw)
  // Compute BPM fields into mutable locals first so the cross-field check can
  // reset both atomically when the invariant is violated.
  // initialBpm: valid only when isValidBpm AND in STRETCH_INITIAL_BPM_OPTIONS (>= 1.5).
  const rawInitialBpm = r.initialBpm
  const rawTargetBpm = r.targetBpm
  let initialBpm: number =
    isValidBpm(rawInitialBpm) && STRETCH_INITIAL_BPM_OPTIONS.includes(rawInitialBpm)
      ? rawInitialBpm
      : DEFAULT_STRETCH_SETTINGS.initialBpm
  let targetBpm: number = isValidBpm(rawTargetBpm)
    ? rawTargetBpm
    : DEFAULT_STRETCH_SETTINGS.targetBpm
  // Cross-field invariant: the ramp must always go strictly downward (targetBpm < initialBpm).
  // Reset BOTH fields together so the returned pair is always a valid down-ramp.
  if (targetBpm >= initialBpm) {
    initialBpm = DEFAULT_STRETCH_SETTINGS.initialBpm
    targetBpm  = DEFAULT_STRETCH_SETTINGS.targetBpm
  }
  // Coerce the start share first so a missing/invalid targetInhaleShare can fall
  // back to the SAME value (FR-13) — a pre-target persisted slice then behaves
  // exactly as it did (target == start == no ratio transition).
  const inhaleShare = isValidInhaleShare(r.inhaleShare) ? r.inhaleShare : DEFAULT_STRETCH_SETTINGS.inhaleShare
  return {
    inhaleShare,
    targetInhaleShare:   isValidInhaleShare(r.targetInhaleShare)     ? r.targetInhaleShare   : inhaleShare,
    initialBpm,
    targetBpm,
    warmUpMinutes:       isValidWarmUp(r.warmUpMinutes)              ? r.warmUpMinutes       : DEFAULT_STRETCH_SETTINGS.warmUpMinutes,
    rampDurationMinutes: isValidRampDuration(r.rampDurationMinutes)  ? r.rampDurationMinutes : DEFAULT_STRETCH_SETTINGS.rampDurationMinutes,
    coolDownMinutes:     isValidCoolDown(r.coolDownMinutes)          ? r.coolDownMinutes     : DEFAULT_STRETCH_SETTINGS.coolDownMinutes,
  }
}

// Per-practice slice coercer: settings goes through the practice-specific
// coercer (coerceSettings for resonant, coerceStretchSettings for stretch,
// coerceNaviKriyaSettings for naviKriya), stats always through coerceStats.
// A drifted/missing slice yields defaults.
function coercePracticeSlice<S>(
  raw: unknown,
  coerceSlotSettings: (v: unknown) => S,
): PracticeSlice<S> {
  const r = asRecord(raw)
  return {
    settings: coerceSlotSettings(r.settings),
    stats: coerceStats(r.stats),
  }
}

export function coercePractices(raw: unknown): PracticeMap {
  const r = asRecord(raw)
  return {
    resonant:  coercePracticeSlice(r.resonant,  coerceSettings),
    stretch:   coercePracticeSlice(r.stretch,   coerceStretchSettings),
    naviKriya: coercePracticeSlice(r.naviKriya, coerceNaviKriyaSettings),
  }
}

// Cross-practice preservation helper: returns the raw on-disk practices map
// (NOT coerced) so a save*/record* that mutates only one slice can spread the
// other two slices back to disk unchanged. Without this, the previous
// `coercePractices(...)` -> spread pattern fully normalized every slice on
// every write — meaning a write to practices.resonant would silently rewrite
// practices.stretch and practices.naviKriya's on-disk shape (stripping
// forward-compatible unknown sub-keys and normalizing any partial corruption).
//
// The contract: callers must coerce their TARGET slice (the one they update)
// before writing, but pass other slices through as raw `unknown`. The on-disk
// envelope is "self-healing on read" via coercePractices at load time, so a
// drifted sibling slice remains a load-time concern, not a write-time one.
function rawPracticesMap(raw: unknown): Record<string, unknown> {
  return asRecord(raw)
}

export function loadPractices(deps: StorageDeps = {}): PracticeMap {
  return coercePractices(readEnvelope(deps).practices)
}

export function loadActivePractice(deps: StorageDeps = {}): PracticeId {
  return coerceActivePractice(readEnvelope(deps).activePractice)
}

export function saveActivePractice(id: PracticeId, deps: StorageDeps = {}): void {
  const env = readEnvelope(deps)
  // Defensive: coerce at the write boundary so a type-unsafe caller (a cast
  // from unknown, a `// @ts-expect-error` test fixture, a hand-rolled storage
  // event handler) cannot land an arbitrary string on disk. coerceActivePractice
  // is a no-op for type-correct callers and a corruption guard otherwise.
  writeEnvelope({ ...env, activePractice: coerceActivePractice(id) }, deps)
}

// Writes a single practice slice's settings. Spreads the RAW on-disk practices
// map so the OTHER two slices (and any forward-compatible unknown sub-keys in
// them) survive untouched — only the target slice is rewritten. `settings` is
// opaque here; it is typed at each public wrapper's boundary below.
function writeSliceSettings(key: PracticeId, settings: unknown, deps: StorageDeps): void {
  const env = readEnvelope(deps)
  const rawPractices = rawPracticesMap(env.practices)
  const rawSlice = asRecord(rawPractices[key])
  writeEnvelope(
    { ...env, practices: { ...rawPractices, [key]: { ...rawSlice, settings } } },
    deps,
  )
}

export function saveResonantSettings(settings: SessionSettings, deps: StorageDeps = {}): void {
  writeSliceSettings('resonant', settings, deps)
}

export function saveNaviKriyaSettings(settings: NaviKriyaSettings, deps: StorageDeps = {}): void {
  writeSliceSettings('naviKriya', settings, deps)
}

export function saveStretchSettings(settings: StretchSettings, deps: StorageDeps = {}): void {
  writeSliceSettings('stretch', settings, deps)
}

// Records a completed/early-ended session into ONE practice slice's stats and
// returns the IN-MEMORY projection. The other slices are passed through as their
// raw on-disk shape (rawPractices spread) so unknown forward-compatible sub-keys
// survive (slice-isolation guarantee). writeEnvelope is fire-and-forget (quota /
// ITP / private mode / future-version short-circuit all silently swallow the
// write); callers treat the return as RAM-authoritative — UI updates immediately.
//
// roundsCompleted is NK-only: when provided it accumulates across sessions and is
// added to the stats. When omitted (resonant / stretch) the field stays ABSENT
// from the returned stats — matching coerceStats' "undefined, not 0" posture so a
// non-NK record never carries roundsCompleted. An early end (isComplete false)
// still records its completed rounds + partial minutes the same way.
function recordPracticeSession(
  key: PracticeId,
  elapsedMs: number,
  isComplete: boolean,
  deps: StorageDeps,
  roundsCompleted?: number,
): PersistedStats {
  const env = readEnvelope(deps)
  // Read the target slice's stats through the coercer (the arithmetic below needs
  // a guaranteed-numeric stats object). The OTHER slices stay raw — see
  // rawPracticesMap for the rationale.
  const rawPractices = rawPracticesMap(env.practices)
  const rawSlice = asRecord(rawPractices[key])
  const stats = coerceStats(rawSlice.stats)
  // Reject NaN/Infinity/negative elapsedMs up front so a bad frame cannot
  // poison totalElapsedSeconds.
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return stats
  }
  // Count if elapsed >= 30s OR isComplete (completion bypasses threshold).
  if (!isComplete && elapsedMs < COUNT_THRESHOLD_MS) {
    return stats
  }
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const now = deps.now ?? Date.now
  const next: PersistedStats = {
    totalSessions: stats.totalSessions + 1,
    totalElapsedSeconds: stats.totalElapsedSeconds + elapsedSeconds,
    lastSessionAtMs: now(),
    lastSessionDurationSeconds: elapsedSeconds,
    ...(roundsCompleted !== undefined
      ? { roundsCompleted: (stats.roundsCompleted ?? 0) + roundsCompleted }
      : {}),
  }
  writeEnvelope(
    { ...env, practices: { ...rawPractices, [key]: { ...rawSlice, stats: next } } },
    deps,
  )
  return next
}

// Wipes ONE practice slice's stats back to zero; the other slices, this slice's
// settings, and any forward-compatible unknown sub-keys all survive (same
// slice-isolation / raw-spread posture as recordPracticeSession). Fire-and-forget
// write — callers treat their optimistic ZERO update as RAM-authoritative.
export function resetPracticeStats(key: PracticeId, deps: StorageDeps = {}): void {
  const env = readEnvelope(deps)
  const rawPractices = rawPracticesMap(env.practices)
  const rawSlice = asRecord(rawPractices[key])
  writeEnvelope(
    { ...env, practices: { ...rawPractices, [key]: { ...rawSlice, stats: { ...ZERO_STATS } } } },
    deps,
  )
}

export function recordResonantSession(
  elapsedMs: number,
  isComplete: boolean,
  deps: StorageDeps = {},
): PersistedStats {
  return recordPracticeSession('resonant', elapsedMs, isComplete, deps)
}

export function recordStretchSession(
  elapsedMs: number,
  isComplete: boolean,
  deps: StorageDeps = {},
): PersistedStats {
  return recordPracticeSession('stretch', elapsedMs, isComplete, deps)
}

export function recordNaviKriyaSession(
  elapsedMs: number,
  roundsCompleted: number,
  isComplete: boolean,
  deps: StorageDeps = {},
): PersistedStats {
  return recordPracticeSession('naviKriya', elapsedMs, isComplete, deps, roundsCompleted)
}
