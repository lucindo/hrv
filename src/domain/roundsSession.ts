// src/domain/roundsSession.ts
//
// Pure-domain model for an HRV "rounds" session: N work blocks separated by rest +
// a per-round 3-2-1 lead-in, run as ONE continuous timeline (single clock). Mirrors
// the stretchRamp.ts segment-table approach — buildRoundsTimeline builds the table
// once, getRoundsFrame looks up the live frame by elapsedSec.
//
// No React, no I/O, no audio imports. The lead-in length is injected (leadInSec) so
// the single source of truth stays in audioEngine (LEAD_IN_DURATION_SEC); the domain
// never reaches into the audio layer.
//
// Timeline shape (rounds = N): round 1's lead-in is the existing PRE-session phase
// (not modelled here — elapsed 0 is round 1's first In). Rounds 2..N are preceded by
// a rest window then a lead-in window, inside the one running session:
//
//   work_1 │ rest │ lead-in │ work_2 │ rest │ lead-in │ … │ work_N
//   └ breathing ┘  └─ gap ──┘  └ breathing ┘            └ breathing ┘

import type { SessionSettings } from './settings'
import { CLAMP_EPSILON_SEC, SEC_PER_MINUTE } from './sessionMath'
import type { BreathPhase, BreathSegment, SessionFrame } from './sessionMath'

export type RoundPhaseKind = 'work' | 'rest' | 'lead-in'

/**
 * One round's breathing work block — a constant-BPM segment on the continuous
 * timeline. Extends BreathSegment so the cue scheduler consumes it directly. startSec
 * already accounts for the rest + lead-in gaps; the gaps carry no breath cycles, so
 * cycleBaseIndex stays continuous across blocks. endSec is cycle-aligned (whole cycles
 * >= the configured work span).
 */
export interface RoundWorkSegment extends BreathSegment {
  readonly round: number // 1-based
}

export interface RoundsTimeline {
  readonly workSegments: RoundWorkSegment[]
  readonly restSec: number
  readonly leadInSec: number
  readonly roundsTotal: number
  readonly configuredWorkSec: number // per-round duration as set (drives the readout countdown)
  readonly totalSec: number          // completion = final work block's cycle-aligned end
}

/**
 * Extends SessionFrame with rounds live-state. roundLeadInDigit is non-null ONLY
 * during a lead-in window; restRemainingSec is > 0 ONLY during a rest window.
 */
export interface RoundsSessionFrame extends SessionFrame {
  readonly roundNumber: number
  readonly roundsTotal: number
  readonly roundPhase: RoundPhaseKind
  readonly restRemainingSec: number
  readonly roundLeadInDigit: 3 | 2 | 1 | null
  // Current round's work countdown (0 in gaps). remainingSec stays whole-practice.
  readonly workRemainingSec: number
}

/**
 * Builds the continuous rounds timeline. `leadInSec` is the per-round lead-in length
 * (caller passes LEAD_IN_DURATION_SEC from audioEngine).
 *
 * Each work block runs the configured per-round duration, held open to the END of the
 * in-progress cycle (rounded UP to whole cycles) — the same rule as getCompletionSec,
 * so a rest begins only after that round's last In/Out finishes.
 */
export function buildRoundsTimeline(settings: SessionSettings, leadInSec: number): RoundsTimeline {
  const { bpm, inhaleShare, durationMinutes, rounds, restMinutes } = settings

  if (!Number.isInteger(rounds) || rounds < 2) {
    throw new RangeError('rounds must be an integer >= 2 for a rounds timeline')
  }
  if (durationMinutes === 'open-ended' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new RangeError('rounds requires a finite positive per-round duration')
  }
  if (!Number.isFinite(restMinutes) || restMinutes <= 0) {
    throw new RangeError('restMinutes must be a positive finite number')
  }
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError('bpm must be a positive finite number')
  }
  if (!Number.isFinite(leadInSec) || leadInSec < 0) {
    throw new RangeError('leadInSec must be a non-negative finite number')
  }

  const cycleSec = SEC_PER_MINUTE / bpm
  const inhaleSec = cycleSec * (inhaleShare / 100)
  const exhaleSec = cycleSec * ((100 - inhaleShare) / 100)
  const restSec = restMinutes * SEC_PER_MINUTE
  const configuredWorkSec = durationMinutes * SEC_PER_MINUTE
  const cyclesPerBlock = Math.ceil(configuredWorkSec / cycleSec)
  const workBlockSec = cyclesPerBlock * cycleSec

  const workSegments: RoundWorkSegment[] = []
  let cursorSec = 0
  for (let round = 1; round <= rounds; round++) {
    // Rounds 2..N are preceded by rest + lead-in; round 1 starts at 0.
    if (round > 1) cursorSec += restSec + leadInSec
    const startSec = cursorSec
    const endSec = startSec + workBlockSec
    workSegments.push({
      round,
      startSec,
      endSec,
      cycleSec,
      inhaleSec,
      exhaleSec,
      cycleBaseIndex: (round - 1) * cyclesPerBlock,
    })
    cursorSec = endSec
  }

  const lastSeg = workSegments[workSegments.length - 1]
  if (lastSeg === undefined) {
    // Unreachable: rounds >= 2 guarantees a non-empty table. Guard satisfies
    // noUncheckedIndexedAccess.
    throw new RangeError('rounds timeline produced no work segments')
  }

  return {
    workSegments,
    restSec,
    leadInSec,
    roundsTotal: rounds,
    configuredWorkSec,
    totalSec: lastSeg.endSec,
  }
}

/**
 * Computes the live frame at elapsedSec. Inside a work block it returns the breath
 * frame; in a gap it returns the rest frame (with restRemainingSec) then the lead-in
 * frame (with roundLeadInDigit). cycleIndex is absolute (continuous across blocks).
 */
export function getRoundsFrame(timeline: RoundsTimeline, elapsedSec: number): RoundsSessionFrame {
  const { workSegments, leadInSec, roundsTotal, totalSec } = timeline
  const lastSeg = workSegments[workSegments.length - 1]
  if (lastSeg === undefined) {
    throw new RangeError('getRoundsFrame requires a non-empty rounds timeline')
  }
  const safeElapsedSec = Math.max(0, elapsedSec)
  const remainingSec = Math.max(0, totalSec - safeElapsedSec)
  const isComplete = safeElapsedSec >= totalSec
  const ctx = { roundsTotal, remainingSec, isComplete, configuredWorkSec: timeline.configuredWorkSec }

  for (const seg of workSegments) {
    if (safeElapsedSec < seg.startSec) {
      // In the gap before `seg`: rest, then lead-in. gapStart === previous block end.
      const restEndSec = seg.startSec - leadInSec
      if (safeElapsedSec < restEndSec) {
        return gapFrame({
          ...ctx,
          roundNumber: seg.round,
          roundPhase: 'rest',
          restRemainingSec: restEndSec - safeElapsedSec,
          roundLeadInDigit: null,
          phase: 'out',
          cycleIndex: seg.cycleBaseIndex,
          elapsedSec: safeElapsedSec,
        })
      }
      return gapFrame({
        ...ctx,
        roundNumber: seg.round,
        roundPhase: 'lead-in',
        restRemainingSec: 0,
        roundLeadInDigit: leadInDigitFor(safeElapsedSec - restEndSec, leadInSec),
        phase: 'in',
        cycleIndex: seg.cycleBaseIndex,
        elapsedSec: safeElapsedSec,
      })
    }
    if (safeElapsedSec < seg.endSec) {
      return workFrame(seg, safeElapsedSec, ctx)
    }
  }

  // Past the final block — completion held to the last cycle's end (endSec is already
  // cycle-aligned). Render the final block's last frame.
  return workFrame(lastSeg, safeElapsedSec, ctx)
}

interface FrameCtx {
  roundsTotal: number
  remainingSec: number
  isComplete: boolean
  configuredWorkSec: number
}

function workFrame(seg: RoundWorkSegment, safeElapsedSec: number, ctx: FrameCtx): RoundsSessionFrame {
  // Clamp into the block so the final cycle's Out-phase shows fully at the block end
  // instead of rolling one cycle past.
  const inBlockSec = Math.min(safeElapsedSec - seg.startSec, seg.endSec - seg.startSec - CLAMP_EPSILON_SEC)
  const cycleInBlock = Math.floor(inBlockSec / seg.cycleSec)
  const cycleElapsedSec = inBlockSec - cycleInBlock * seg.cycleSec
  const isInPhase = cycleElapsedSec < seg.inhaleSec
  const phaseElapsedSec = isInPhase ? cycleElapsedSec : cycleElapsedSec - seg.inhaleSec
  const phaseDurationSec = isInPhase ? seg.inhaleSec : seg.exhaleSec
  const rawProgress = phaseDurationSec === 0 ? 0 : phaseElapsedSec / phaseDurationSec
  const phase: BreathPhase = isInPhase ? 'in' : 'out'

  return {
    phase,
    phaseLabel: isInPhase ? 'In' : 'Out',
    elapsedSec: safeElapsedSec,
    remainingSec: ctx.remainingSec,
    phaseProgress: Math.min(1, Math.max(0, rawProgress)),
    cycleIndex: seg.cycleBaseIndex + cycleInBlock,
    isComplete: ctx.isComplete,
    roundNumber: seg.round,
    roundsTotal: ctx.roundsTotal,
    roundPhase: 'work',
    restRemainingSec: 0,
    roundLeadInDigit: null,
    // Count down the configured duration; hold at 0 while the rounded-up final
    // cycle finishes (block end ≥ configured end).
    workRemainingSec: Math.max(0, seg.startSec + ctx.configuredWorkSec - safeElapsedSec),
  }
}

interface GapFrameArgs extends FrameCtx {
  roundNumber: number
  roundPhase: RoundPhaseKind
  restRemainingSec: number
  roundLeadInDigit: 3 | 2 | 1 | null
  phase: BreathPhase
  cycleIndex: number
  elapsedSec: number
}

function gapFrame(args: GapFrameArgs): RoundsSessionFrame {
  return {
    phase: args.phase,
    phaseLabel: args.phase === 'in' ? 'In' : 'Out',
    elapsedSec: args.elapsedSec,
    remainingSec: args.remainingSec,
    phaseProgress: 0,
    cycleIndex: args.cycleIndex,
    isComplete: args.isComplete,
    roundNumber: args.roundNumber,
    roundsTotal: args.roundsTotal,
    roundPhase: args.roundPhase,
    restRemainingSec: args.restRemainingSec,
    roundLeadInDigit: args.roundLeadInDigit,
    workRemainingSec: 0,
  }
}

// Maps elapsed-into-lead-in to the displayed digit: even thirds of leadInSec map to
// 3 → 2 → 1 (matches the pre-session lead-in's 1-second ticks for the default 3 s).
function leadInDigitFor(tInLeadInSec: number, leadInSec: number): 3 | 2 | 1 {
  if (leadInSec <= 0) return 1
  const idx = Math.min(2, Math.max(0, Math.floor(tInLeadInSec / (leadInSec / 3))))
  return (3 - idx) as 3 | 2 | 1
}
