import { SEC_PER_MINUTE } from './sessionMath'
import type { SessionSettings } from './settings'
import { validateSettings } from './settings'

export interface BreathingPlan {
  readonly bpm: number
  readonly inhaleShare: number
  readonly cycleSec: number
  readonly inhaleSec: number
  readonly exhaleSec: number
  readonly totalSec: number | null
}

export function createBreathingPlan(settings: SessionSettings): BreathingPlan {
  const validSettings = validateSettings(settings)
  const inhaleShare = validSettings.inhaleShare
  const cycleSec = SEC_PER_MINUTE / validSettings.bpm
  const inhaleSec = cycleSec * (inhaleShare / 100)
  const exhaleSec = cycleSec * ((100 - inhaleShare) / 100)
  const totalSec =
    validSettings.durationMinutes === 'open-ended'
      ? null
      : validSettings.durationMinutes * SEC_PER_MINUTE

  return {
    bpm: validSettings.bpm,
    inhaleShare,
    cycleSec,
    inhaleSec,
    exhaleSec,
    totalSec,
  }
}
