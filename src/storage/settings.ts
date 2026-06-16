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
  type SessionSettings,
} from '../domain/settings'

import { asRecord, readEnvelope, writeEnvelope, type StorageDeps } from './storage'

export function coerceSettings(raw: unknown): SessionSettings {
  const r = asRecord(raw)
  return {
    bpm:             isValidBpm(r.bpm)                  ? r.bpm             : DEFAULT_SETTINGS.bpm,
    inhaleShare:     isValidInhaleShare(r.inhaleShare)  ? r.inhaleShare     : DEFAULT_SETTINGS.inhaleShare,
    durationMinutes: isValidDuration(r.durationMinutes) ? r.durationMinutes : DEFAULT_SETTINGS.durationMinutes,
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
