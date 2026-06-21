import { describe, expect, it } from 'vitest'

import type { SessionSettings } from './settings'
import { DEFAULT_SETTINGS, DEFAULT_STRETCH_SETTINGS } from './settings'
import type { StretchSettings } from './settings'
import {
  completeIfNeeded,
  endSession,
  extendTimedSession,
  startRoundsSession,
  startSession,
  startStretchSession,
} from './sessionController'

const baseSettings: SessionSettings = {
  ...DEFAULT_SETTINGS,
  bpm: 5.5,
  inhaleShare: 40,
  durationMinutes: 10,
}

// Numeric time values are seconds-shaped.

describe('session lifecycle controller', () => {
  it('locks BPM and ratio when starting so later selected settings cannot mutate the running plan', () => {
    const selectedSettings = { ...baseSettings }
    const running = startSession(selectedSettings, 1)

    selectedSettings.bpm = 7
    selectedSettings.inhaleShare = 20
    selectedSettings.durationMinutes = 60

    expect(running.lockedSettings).toEqual(baseSettings)
    expect(running.plan.bpm).toBe(5.5)
    expect(running.plan.inhaleShare).toBe(40)
    expect(running.startedAtSec).toBe(1)
    expect(running.lastFrame.phaseLabel).toBe('In')
  })

  it('ends running sessions by clearing active state while preserving selected settings', () => {
    const running = startSession(baseSettings, 1)
    const extended = extendTimedSession(running, 15, 1)

    expect(endSession(extended)).toEqual({
      status: 'idle',
      selectedSettings: { ...baseSettings, durationMinutes: 15 },
    })
  })

  it('completes timed sessions with the required message when total duration is reached', () => {
    const running = startSession({ ...baseSettings, durationMinutes: 5 }, 2)
    // Completion holds to the next cycle boundary so cues are never cut mid-In/mid-Out.
    // At bpm 5.5 the 5-min boundary lands mid-cycle; completion fires once the
    // surrounding cycle finishes, not at the raw duration mark.
    const cycleSec = running.plan.cycleSec
    const completionSec = Math.ceil((5 * 60) / cycleSec) * cycleSec

    const atDuration = completeIfNeeded(running, 2 + 5 * 60)
    expect(atDuration.status).toBe('running')

    const complete = completeIfNeeded(running, 2 + completionSec)

    expect(complete.status).toBe('complete')
    if (complete.status !== 'complete') {
      throw new Error('Expected complete state')
    }
    expect(complete.message).toBe('Session complete')
    expect(complete.completedAtSec).toBe(2 + completionSec)
    expect(complete.lockedSettings).toEqual({ ...baseSettings, durationMinutes: 5 })
  })

  it('keeps open-ended sessions running past 60 minutes until manually ended', () => {
    const running = startSession({ ...baseSettings, durationMinutes: 'open-ended' }, 0)

    const later = completeIfNeeded(running, 61 * 60)

    expect(later.status).toBe('running')
    if (later.status !== 'running') {
      throw new Error('Expected running state')
    }
    expect(later.lastFrame.remainingSec).toBeNull()
    expect(endSession(later).status).toBe('idle')
  })

  it('extends only timed running sessions to greater finite durations', () => {
    const running = startSession({ ...baseSettings, durationMinutes: 10 }, 0)

    const extended = extendTimedSession(running, 15, 0)

    expect(extended.selectedSettings.durationMinutes).toBe(15)
    expect(extended.lockedSettings.durationMinutes).toBe(15)
    expect(extended.plan.totalSec).toBe(15 * 60)

    expect(() => extendTimedSession(extended, 15, 0)).toThrow(RangeError)
    expect(() => extendTimedSession(extended, 10, 0)).toThrow(RangeError)
    expect(() => extendTimedSession(extended, Number.POSITIVE_INFINITY, 0)).toThrow(RangeError)

    const openEnded = startSession({ ...baseSettings, durationMinutes: 'open-ended' }, 0)
    expect(() => extendTimedSession(openEnded, 60, 0)).toThrow(RangeError)
  })

  it('throws RangeError for a finite durationMinutes not in DURATION_OPTIONS (D-01 allowlist boundary)', () => {
    const running = startSession({ ...baseSettings, durationMinutes: 10 }, 0)
    // 7 is finite but not in DURATION_OPTIONS (which contains 5,10,15,...,60,'open-ended')
    expect(() => extendTimedSession(running, 7, 0)).toThrow(RangeError)
  })
})

describe('startSession standard-only (D-01)', () => {
  it('sets stretchSegments to null for standard sessions (regression guard)', () => {
    const running = startSession(baseSettings, 1)
    expect(running.stretchSegments).toBeNull()
    expect(running.lastFrame.phaseLabel).toBe('In')
    expect(running.lastFrame.currentBpm).toBeUndefined()
  })

  it('returns status running with a standard frame', () => {
    const running = startSession(baseSettings, 0)
    expect(running.status).toBe('running')
    expect(running.stretchSegments).toBeNull()
  })
})

describe('startStretchSession (D-01, D-02)', () => {
  const stretchSettings: StretchSettings = {
    inhaleShare: 40,
    targetInhaleShare: 40,
    initialBpm: 6,
    targetBpm: 4,
    warmUpMinutes: 10,
    coolDownMinutes: 15,
    rampDurationMinutes: 20,
  }

  const resonantSettings: SessionSettings = {
    ...DEFAULT_SETTINGS,
    bpm: 5.5,
    inhaleShare: 40,
    durationMinutes: 20,
  }

  it('returns status running with a non-null stretchSegments table', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 1)
    expect(running.status).toBe('running')
    expect(running.stretchSegments).not.toBeNull()
    expect(running.stretchSegments?.length).toBeGreaterThan(0)
  })

  it('lastFrame is a stretch frame (has currentBpm and stage)', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 1)
    expect(running.lastFrame.currentBpm).toBe(6)
    expect(running.lastFrame.stage).toBe('hold-initial')
  })

  it('startedAtSec matches the provided nowSec', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 5)
    expect(running.startedAtSec).toBe(5)
  })

  it('DEFAULT_STRETCH_SETTINGS produces a valid stretch session', () => {
    const running = startStretchSession(DEFAULT_STRETCH_SETTINGS, resonantSettings, 0)
    expect(running.status).toBe('running')
    expect(running.stretchSegments).not.toBeNull()
    expect(running.lastFrame.currentBpm).toBe(DEFAULT_STRETCH_SETTINGS.initialBpm)
  })

  it('completeIfNeeded on a stretch session dispatches to the stretch frame', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 0)
    // 15 minutes in — mid-ramp (warm-up 10 min, ramp 10:00–30:00)
    const next = completeIfNeeded(running, 15 * 60)
    expect(next.status).toBe('running')
    if (next.status !== 'running') throw new Error('Expected running state')
    expect(next.lastFrame.stage).toBe('ramp')
    expect(typeof next.lastFrame.currentBpm).toBe('number')
  })

  it('an open-ended stretch session never returns a complete state', () => {
    const running = startStretchSession({ ...stretchSettings, coolDownMinutes: 'open-ended' }, resonantSettings, 0)
    const later = completeIfNeeded(running, 5 * 60 * 60)
    expect(later.status).toBe('running')
    if (later.status !== 'running') throw new Error('Expected running state')
    expect(later.lastFrame.remainingSec).toBeNull()
  })

  it('a finite stretch session completes once its computed total is reached', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 0)
    // total = (warm-up 10 + ramp 20 + cool-down 15) min = 45 min = 2700 sec
    const totalSec = (10 + 20 + 15) * 60
    const atTotal = completeIfNeeded(running, totalSec + 60)
    expect(atTotal.status).toBe('complete')
    if (atTotal.status !== 'complete') throw new Error('Expected complete state')
    expect(atTotal.message).toBe('Session complete')
  })

  // selectedSettings must be the caller's resonant config, NOT the synthetic lead-in.
  // lockedSettings carries the lead-in (for the plan); selectedSettings is passed
  // through so endSession returns the resonant config.
  it('WR-03: selectedSettings deep-equals the passed resonant settings (NOT the lead-in)', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 0)
    // selectedSettings must equal the resonant config (passed as second arg).
    expect(running.selectedSettings).toEqual(resonantSettings)
    // Verify it is NOT the synthetic lead-in shape (bpm: initialBpm, durationMinutes: 'open-ended').
    expect(running.selectedSettings.bpm).toBe(resonantSettings.bpm)
    expect(running.selectedSettings.durationMinutes).toBe(resonantSettings.durationMinutes)
  })

  it('WR-03: lockedSettings is the synthetic lead-in (bpm: initialBpm, durationMinutes: open-ended)', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 0)
    expect(running.lockedSettings.bpm).toBe(stretchSettings.initialBpm)
    expect(running.lockedSettings.durationMinutes).toBe('open-ended')
  })

  it('WR-03: endSession returns idle selectedSettings equal to the original resonant settings', () => {
    const running = startStretchSession(stretchSettings, resonantSettings, 0)
    const idle = endSession(running)
    expect(idle.selectedSettings).toEqual(resonantSettings)
  })
})

describe('extendTimedSession — no mode check (D-01)', () => {
  it('throws RangeError for a stretch session (stretchSegments !== null gate)', () => {
    const stretchSettings: StretchSettings = {
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 10,
      coolDownMinutes: 15,
      rampDurationMinutes: 20,
    }
    const running = startStretchSession(stretchSettings, DEFAULT_SETTINGS, 0)
    expect(() => extendTimedSession(running, 30, 0)).toThrow(RangeError)
  })
})

describe('startRoundsSession + rounds completeIfNeeded', () => {
  // bpm 6 → cycleSec 10; durationMinutes 5 → 300 s block; rounds 2; restMinutes 1; leadIn 3.
  //   work_1 [0,300) · rest [300,360) · lead-in [360,363) · work_2 [363,663)
  const roundsSettings: SessionSettings = {
    ...DEFAULT_SETTINGS, bpm: 6, inhaleShare: 40, durationMinutes: 5, rounds: 2, restMinutes: 1,
  }
  const LEAD_IN = 3

  it('builds a running session with a rounds timeline and a round-1 work frame', () => {
    const running = startRoundsSession(roundsSettings, 0, LEAD_IN)
    expect(running.status).toBe('running')
    expect(running.roundsTimeline?.totalSec).toBe(663)
    expect(running.stretchSegments).toBeNull()
    expect(running.lastFrame).toMatchObject({ roundPhase: 'work', roundNumber: 1, isComplete: false })
  })

  it('completeIfNeeded dispatches to the rounds frame across work / rest / completion', () => {
    const running = startRoundsSession(roundsSettings, 100, LEAD_IN)  // startedAt 100
    expect(completeIfNeeded(running, 100 + 150).status).toBe('running')

    const resting = completeIfNeeded(running, 100 + 320)  // in the rest gap [300,360)
    if (resting.status !== 'running') throw new Error('expected running')
    expect(resting.lastFrame.roundPhase).toBe('rest')

    expect(completeIfNeeded(running, 100 + 662).status).toBe('running')

    const complete = completeIfNeeded(running, 100 + 663)
    expect(complete.status).toBe('complete')
    // Timeline is carried into the complete state (for stats / consumers).
    expect(complete.status === 'complete' && complete.roundsTimeline?.totalSec).toBe(663)
  })

  it('rounds sessions cannot be extended via durationMinutes', () => {
    const running = startRoundsSession(roundsSettings, 0, LEAD_IN)
    expect(() => extendTimedSession(running, 15, 0)).toThrow(RangeError)
  })
})
