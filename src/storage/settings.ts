// src/storage/settings.ts
//
// Per-field validate-and-fallback for settings + mute. Coercers are NON-THROWING
// (cousin to validateSettings in src/domain/settings.ts which throws). Per-field
// policy means a single drifted field does NOT discard the rest of the envelope.
//
// coerceSettings covers the 3 standard fields only; stretch-specific fields
// (initialBpm, targetBpm, warmUpMinutes, coolDownMinutes, rampDurationMinutes)
// live in coerceStretchSettings in practices.ts.

import {
  DEFAULT_SETTINGS,
  isValidBpm,
  isValidInhaleShare,
  isValidDuration,
  isValidResonantRounds,
  isValidRestMinutes,
  type SessionSettings,
} from '../domain/settings'

import { asRecord, readEnvelope, writeEnvelope, type StorageDeps } from './storage'

export function coerceSettings(raw: unknown): SessionSettings {
  const r = asRecord(raw)
  const durationMinutes = isValidDuration(r.durationMinutes) ? r.durationMinutes : DEFAULT_SETTINGS.durationMinutes
  const rounds = isValidResonantRounds(r.rounds) ? r.rounds : DEFAULT_SETTINGS.rounds
  // Rounds mode needs a finite duration; a corrupt/hand-edited open-ended+rounds
  // pair would never advance, so disable rounds rather than discard the duration.
  const safeRounds = rounds > 1 && durationMinutes === 'open-ended' ? 1 : rounds
  return {
    bpm:             isValidBpm(r.bpm)                 ? r.bpm         : DEFAULT_SETTINGS.bpm,
    inhaleShare:     isValidInhaleShare(r.inhaleShare) ? r.inhaleShare : DEFAULT_SETTINGS.inhaleShare,
    durationMinutes,
    rounds:          safeRounds,
    restMinutes:     isValidRestMinutes(r.restMinutes) ? r.restMinutes : DEFAULT_SETTINGS.restMinutes,
  }
}

export function coerceMute(raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : false
}

export function loadMute(deps: StorageDeps = {}): boolean {
  return coerceMute(readEnvelope(deps).mute)
}

export function saveMute(muted: boolean, deps: StorageDeps = {}): void {
  const env = readEnvelope(deps)
  writeEnvelope({ ...env, mute: muted }, deps)
}
