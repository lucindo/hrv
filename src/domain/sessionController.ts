import type { BreathingPlan } from './breathingPlan'
import { createBreathingPlan } from './breathingPlan'
import type { SessionFrame } from './sessionMath'
import { getSessionFrame } from './sessionMath'
import type { DurationOption, SessionSettings, StretchSettings } from './settings'
import { DURATION_OPTIONS } from './settings'
import type { StretchSegment } from './stretchRamp'
import { buildStretchSegments, getStretchFrame } from './stretchRamp'

export type SessionStatus = 'idle' | 'running' | 'complete'

export interface IdleSessionState {
  status: 'idle'
  selectedSettings: SessionSettings
}

export interface RunningSessionState {
  status: 'running'
  selectedSettings: SessionSettings
  lockedSettings: SessionSettings
  plan: BreathingPlan
  stretchSegments: StretchSegment[] | null
  // startedAtSec is the seconds-shaped session-start timestamp from the
  // injected SessionClock (audioCtx.currentTime via the SessionClock seam).
  startedAtSec: number
  lastFrame: SessionFrame
}

export interface CompleteSessionState {
  status: 'complete'
  selectedSettings: SessionSettings
  lockedSettings: SessionSettings
  plan: BreathingPlan
  stretchSegments: StretchSegment[] | null
  completedAtSec: number
  message: 'Session complete'
}

export type SessionState = IdleSessionState | RunningSessionState | CompleteSessionState

// SessionSettings contains only primitives — a shallow copy is intentionally sufficient.
// If any field becomes an object/array, change this to a deep clone so callers cannot
// reach into the locked/idle state through a shared reference.
function cloneSettings(settings: SessionSettings): SessionSettings {
  return { ...settings }
}

// startSession is standard-only — no mode check, stretchSegments always null.
export function startSession(selectedSettings: SessionSettings, nowSec: number): RunningSessionState {
  const lockedSettings = cloneSettings(selectedSettings)
  const plan = createBreathingPlan(lockedSettings)
  const lastFrame = getSessionFrame(plan, 0)

  return {
    status: 'running',
    selectedSettings: cloneSettings(selectedSettings),
    lockedSettings,
    plan,
    stretchSegments: null,
    startedAtSec: nowSec,
    lastFrame,
  }
}

// startStretchSession: lead-in plan runs at initialBpm so cue duration matches the warm-up rate.
// The caller's resonant selectedSettings are passed through unchanged so endSession returns
// the resonant config (not the synthetic lead-in). The synthetic lead-in lives ONLY in
// lockedSettings; selectedSettings carries the resonant config through the entire session.
export function startStretchSession(
  stretchSettings: StretchSettings,
  selectedSettings: SessionSettings,
  nowSec: number,
): RunningSessionState {
  // Lead-in plan: standard SessionSettings using initialBpm and the same inhale share.
  // Assigned only to lockedSettings — selectedSettings is the caller's resonant config.
  const leadInSettings: SessionSettings = {
    bpm: stretchSettings.initialBpm,
    inhaleShare: stretchSettings.inhaleShare,
    durationMinutes: 'open-ended',
  }
  const plan = createBreathingPlan(leadInSettings)
  // buildStretchSegments takes a single StretchSettings arg
  const stretchSegments = buildStretchSegments(stretchSettings)
  const lastFrame = getStretchFrame(stretchSegments, 0)

  return {
    status: 'running',
    selectedSettings: cloneSettings(selectedSettings),  // resonant config passes through unchanged
    lockedSettings: leadInSettings,                      // synthetic lead-in drives the audio plan
    plan,
    stretchSegments,
    startedAtSec: nowSec,
    lastFrame,
  }
}

export function endSession(state: RunningSessionState | CompleteSessionState): IdleSessionState {
  return {
    status: 'idle',
    selectedSettings: cloneSettings(state.selectedSettings),
  }
}

export function extendTimedSession(
  state: RunningSessionState,
  durationMinutes: number,
  nowSec: number,
): RunningSessionState {
  // Stretch sessions cannot be extended via durationMinutes — their duration is
  // governed by the rampDurationMinutes picker and the computed segment-table total.
  if (state.stretchSegments !== null) {
    throw new RangeError('Stretch sessions cannot be extended via durationMinutes')
  }

  if (state.lockedSettings.durationMinutes === 'open-ended') {
    throw new RangeError('Open-ended sessions cannot be converted while running')
  }

  if (!(DURATION_OPTIONS as readonly DurationOption[]).includes(durationMinutes)) {
    throw new RangeError('durationMinutes must be one of DURATION_OPTIONS')
  }

  // The DURATION_OPTIONS membership check above already excludes Infinity and NaN
  // (DURATION_OPTIONS is a finite-number-only allowlist plus the 'open-ended' string,
  // and the open-ended case is rejected earlier when state.lockedSettings.durationMinutes
  // is 'open-ended'). Only the monotonic-increase invariant remains to enforce here.
  if (durationMinutes <= state.lockedSettings.durationMinutes) {
    throw new RangeError(
      `Cannot extend to ${String(durationMinutes)} (current is ${String(state.lockedSettings.durationMinutes)}); new duration must be strictly greater`,
    )
  }

  const selectedSettings = {
    ...state.selectedSettings,
    durationMinutes,
  }
  const lockedSettings = {
    ...state.lockedSettings,
    durationMinutes,
  }
  const plan = createBreathingPlan(lockedSettings)

  // Recompute `lastFrame` from the live clock (`nowSec - startedAtSec`) rather
  // than the stale `state.lastFrame.elapsedSec`. `lastFrame` is only refreshed
  // on rAF ticks; an extend invoked between ticks would otherwise make the next
  // `completeIfNeeded` jump elapsed time discontinuously.
  const elapsedSec = nowSec - state.startedAtSec

  return {
    ...state,
    selectedSettings,
    lockedSettings,
    plan,
    lastFrame: getSessionFrame(plan, elapsedSec),
  }
}

export function completeIfNeeded(
  state: RunningSessionState,
  nowSec: number,
): RunningSessionState | CompleteSessionState {
  const elapsedSec = nowSec - state.startedAtSec
  const lastFrame = state.stretchSegments !== null
    ? getStretchFrame(state.stretchSegments, elapsedSec)
    : getSessionFrame(state.plan, elapsedSec)

  if (!lastFrame.isComplete) {
    return {
      ...state,
      lastFrame,
    }
  }

  return {
    status: 'complete',
    selectedSettings: cloneSettings(state.selectedSettings),
    lockedSettings: cloneSettings(state.lockedSettings),
    plan: state.plan,
    stretchSegments: state.stretchSegments,
    completedAtSec: nowSec,
    message: 'Session complete',
  }
}
