import type { BreathingPlan } from './breathingPlan'
import type { StretchStage } from './stretchRamp'

export type BreathPhase = 'in' | 'out'

// Minutes→seconds factor for cycle/duration math. Shared by the breathing plan,
// stretch ramp, and rounds timeline.
export const SEC_PER_MINUTE = 60

// Pulls an exact segment boundary 1 ms inside the span so Math.floor(elapsed / cycleSec)
// stays on the last real cycle index instead of rolling one past it. Shared by the
// stretch and rounds per-segment frame walks.
export const CLAMP_EPSILON_SEC = 0.001

// The breath-segment fields the cue walk + per-segment frame math read. StretchSegment
// and RoundWorkSegment both extend this, so walkFutureCues accepts either without a
// stretch- or rounds-specific shape.
export interface BreathSegment {
  readonly startSec: number
  readonly endSec: number
  readonly cycleSec: number
  readonly inhaleSec: number
  readonly exhaleSec: number
  readonly cycleBaseIndex: number
}

export interface SessionFrame {
  readonly phase: BreathPhase
  readonly phaseLabel: 'In' | 'Out'
  readonly elapsedSec: number
  readonly remainingSec: number | null
  readonly phaseProgress: number
  readonly cycleIndex: number
  readonly isComplete: boolean
  // Optional stretch-only fields — undefined for standard sessions
  readonly cycleStartSec?: number
  readonly currentCycleSec?: number
  readonly currentInhaleSec?: number
  readonly currentExhaleSec?: number
  readonly currentBpm?: number
  readonly stage?: StretchStage
  // Optional rounds-only fields — undefined for standard + stretch sessions.
  // roundLeadInDigit is non-null only during a lead-in window; restRemainingSec is
  // > 0 only during a rest window. workRemainingSec is the CURRENT round's work
  // countdown (remainingSec stays whole-practice). (Read surface for the
  // controller + presentation.)
  readonly roundNumber?: number
  readonly roundsTotal?: number
  readonly roundPhase?: 'work' | 'rest' | 'lead-in'
  readonly restRemainingSec?: number
  readonly roundLeadInDigit?: 3 | 2 | 1 | null
  readonly workRemainingSec?: number
}

export function getSessionFrame(plan: BreathingPlan, elapsedSec: number): SessionFrame {
  const safeElapsedSec = Math.max(0, elapsedSec)
  // Degenerate-plan guard: a non-positive cycle length makes the cycleIndex
  // division Infinity and the modulo NaN, poisoning the frame. Valid plans always
  // have cycleSec > 0 (createBreathingPlan validates), so this only shields a
  // direct caller passing an unvalidated plan — mirrors walkFutureCues' guard.
  if (plan.cycleSec <= 0) {
    return {
      phase: 'in',
      phaseLabel: 'In',
      elapsedSec: safeElapsedSec,
      remainingSec: plan.totalSec === null ? null : Math.max(0, plan.totalSec - safeElapsedSec),
      phaseProgress: 0,
      cycleIndex: 0,
      isComplete: false,
    }
  }
  const cycleIndex = Math.floor(safeElapsedSec / plan.cycleSec)
  const cycleElapsedSec = safeElapsedSec % plan.cycleSec
  const isInPhase = cycleElapsedSec < plan.inhaleSec
  const phaseElapsedSec = isInPhase ? cycleElapsedSec : cycleElapsedSec - plan.inhaleSec
  const phaseDurationSec = isInPhase ? plan.inhaleSec : plan.exhaleSec
  const phaseProgress = phaseDurationSec === 0 ? 0 : phaseElapsedSec / phaseDurationSec
  const remainingSec = plan.totalSec === null ? null : Math.max(0, plan.totalSec - safeElapsedSec)
  // Completion holds until the current cycle finishes (see getCompletionSec).
  const completionSec = getCompletionSec(plan)

  return {
    phase: isInPhase ? 'in' : 'out',
    phaseLabel: isInPhase ? 'In' : 'Out',
    elapsedSec: safeElapsedSec,
    remainingSec,
    phaseProgress,
    cycleIndex,
    isComplete: completionSec !== null && safeElapsedSec >= completionSec,
  }
}

/**
 * The elapsed-seconds boundary at which a timed session reports complete.
 *
 * Completion is held to the END of the in-progress cycle so audio cues and the
 * orb are never cut mid-In/mid-Out: the configured total is rounded UP to the
 * next cycle boundary. This is the SAME value getSessionFrame's isComplete check
 * uses — exposed so cue scheduling can trim the lookahead at the TRUE session end
 * (the rounded boundary) instead of the raw `plan.totalSec`. Trimming at totalSec
 * would silence the held-open final cycle's breath cues.
 *
 * Returns null for open-ended plans (totalSec === null) and for degenerate plans
 * (cycleSec <= 0, which never complete — mirrors getSessionFrame's guard).
 */
export function getCompletionSec(plan: BreathingPlan): number | null {
  if (plan.totalSec === null || plan.cycleSec <= 0) return null
  return Math.ceil(plan.totalSec / plan.cycleSec) * plan.cycleSec
}

// `formatDuration` consumes seconds-shaped values; param `sec` makes the unit
// explicit at the call site.
export function formatDuration(sec: number): string {
  const totalSeconds = Math.max(0, Math.floor(sec))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes)}:${seconds.toString().padStart(2, '0')}`
}
