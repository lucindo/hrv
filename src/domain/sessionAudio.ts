import type { BreathingPlan } from './breathingPlan'
import type { RoundsTimeline, RoundWorkSegment } from './roundsSession'
import { getCompletionSec, type BreathSegment, type SessionFrame } from './sessionMath'
import { getStretchCompletionSec, type StretchSegment } from './stretchRamp'

export interface BoundaryAudioOffsets {
  // boundaryStartSec is the session-elapsed seconds at the start of the upcoming
  // phase. The caller converts this to an audio-clock time by adding the
  // per-session audio anchor — boundaryStartSec is a sessionFrame-shaped
  // quantity, not an audio-clock instant.
  readonly boundaryStartSec: number
  readonly phaseDurationSec: number
}

// ─── walkFutureCues ───────────────────────────────────────────────────────────

/**
 * Hard iteration cap for walkFutureCues.
 *
 * Derived as a safe multiple of the maximum cues a valid lookahead window can
 * emit: LOOKAHEAD_WINDOW_SEC / smallest-plausible-phase-duration + LOOKAHEAD_MIN_CUES.
 * At the minimum BPM=1 with 50:50 ratio, each phase is 30s — the window emits at most
 * 6/30 < 1 cue from the seconds budget, relying on LOOKAHEAD_MIN_CUES=2.
 * At the maximum BPM=7 with 20:80 ratio (shortest inhale), each inhale ≈ 1.7s —
 * the window can emit at most 6/1.7 ≈ 4 cues per window (never close to 10_000).
 * 10_000 is therefore a pure defense against degenerate/inconsistent plans
 * (negative or inconsistent phase offsets that prevent normal exit) and can
 * never be reached by any valid HRV or Stretch plan.
 */
export const MAX_WALK_ITERATIONS = 10_000 as const

export interface FutureCue {
  audioTime: number
  phaseDurationSec: number
  kind: 'in' | 'out'
}

/**
 * Walk N future cues forward from the given anchor + position.
 *
 * Returns an array of cue descriptors for dispatch via engine.topUpLookahead.
 * Each entry represents one upcoming phase boundary.
 *
 * Pure function: no React, no I/O, no side effects.
 *
 * Hybrid window: queue any cue whose relSec ≤ windowEndElapsedSec, but always
 * keep at least minCues cues (floor). At low BPM the floor dominates; at high BPM
 * the seconds window dominates.
 *
 * Stretch: when segments[] is provided, each cue's phaseDurationSec comes from
 * its OWN segment (linear-walk per cue, matching getStretchFrame posture in stretchRamp.ts).
 *
 * Timed-session trim: when targetSec is defined, never emit cues past
 * audioAnchor + targetSec. The trim overrides the floor for timed sessions.
 */
export function walkFutureCues(args: {
  audioAnchor: number
  elapsedSec: number
  fromCycleIndex: number
  fromPhase: 'in' | 'out'
  plan: BreathingPlan
  segments?: BreathSegment[] | undefined
  lookaheadWindowSec: number
  minCues: number
  targetSec?: number | undefined
}): FutureCue[] {
  const {
    audioAnchor,
    elapsedSec,
    fromCycleIndex,
    fromPhase,
    plan,
    segments,
    lookaheadWindowSec,
    minCues,
    targetSec,
  } = args

  // Defensive ASSERT: degenerate input — avoid infinite loops
  if (plan.cycleSec <= 0) return []
  if (segments !== undefined) {
    // Check that at least one segment has a valid cycleSec
    const allDegenerate = segments.every(s => s.cycleSec <= 0)
    if (allDegenerate) return []
  }

  // Compute window end in elapsed-seconds space
  let windowEndElapsedSec = elapsedSec + lookaheadWindowSec
  // If targetSec is defined, clamp the window at the session end
  if (targetSec !== undefined) {
    windowEndElapsedSec = Math.min(windowEndElapsedSec, targetSec)
  }

  const result: FutureCue[] = []
  let currentCycleIndex = fromCycleIndex
  let currentPhase: 'in' | 'out' = fromPhase

  // Walk loop: emit one cue per iteration.
  // MAX_WALK_ITERATIONS hard cap: a degenerate plan (cycleSec>0, inconsistent phase
  // offsets, targetSec===undefined) cannot hang the rAF tick. The cap cannot be reached by
  // any valid HRV or Stretch plan — see MAX_WALK_ITERATIONS comment above.
  for (let _i = 0; _i < MAX_WALK_ITERATIONS; _i++) {
    // Compute the session-elapsed time at the start of this cue (relative to anchor=0)
    let audioTimeRelSec: number
    let phaseDurationSec: number

    if (segments === undefined) {
      // ── HRV branch: uniform cycleSec stride ──
      const cycleStart = currentCycleIndex * plan.cycleSec
      const phaseOffset = currentPhase === 'in' ? 0 : plan.inhaleSec
      audioTimeRelSec = cycleStart + phaseOffset
      phaseDurationSec = currentPhase === 'in' ? plan.inhaleSec : plan.exhaleSec
    } else {
      // ── Segmented branch: per-segment cycleSec from segment table (stretch + rounds) ──
      // Compute audioTimeRelSec from cycleIndex + phase using segment walk
      // (mirrors getStretchFrame segment walk in stretchRamp.ts)
      // segments is non-empty (guarded by the caller via allDegenerate check above);
      // the last element is always present. Provide a fallback to satisfy TypeScript without
      // a non-null assertion — this branch is unreachable with a valid segments array.
      const lastSeg = segments[segments.length - 1]
      if (lastSeg === undefined) return []
      let activeSeg: BreathSegment = lastSeg
      for (const seg of segments) {
        if (seg.cycleBaseIndex > currentCycleIndex) break
        activeSeg = seg
      }

      // Compute cycle position within the active segment
      const cycleInSegment = currentCycleIndex - activeSeg.cycleBaseIndex
      const cycleStartInSeg = cycleInSegment * activeSeg.cycleSec
      const phaseOffset = currentPhase === 'in' ? 0 : activeSeg.inhaleSec
      audioTimeRelSec = activeSeg.startSec + cycleStartInSeg + phaseOffset
      phaseDurationSec = currentPhase === 'in' ? activeSeg.inhaleSec : activeSeg.exhaleSec
    }

    const audioTime = audioAnchor + audioTimeRelSec

    // Timed-session trim: never emit a cue at or past targetSec — overrides floor.
    // The boundary is EXCLUSIVE: a cue starting exactly at targetSec is the onset of
    // the next cycle (the session occupies [0, targetSec)). For cycle-aligned
    // durations that instant is also where the end chord plays, so emitting it would
    // overlap the breath cue with the session-end sound and start an inhale the
    // screen immediately cuts.
    if (targetSec !== undefined && audioTimeRelSec >= targetSec) {
      break
    }

    // Hybrid stop: floor satisfied AND window exhausted → stop
    if (result.length >= minCues && audioTimeRelSec > windowEndElapsedSec) {
      break
    }

    // Emit the cue
    result.push({ audioTime, phaseDurationSec, kind: currentPhase })

    // Advance to the next phase
    if (currentPhase === 'in') {
      currentPhase = 'out'
    } else {
      currentPhase = 'in'
      currentCycleIndex += 1
    }
  }

  return result
}

/**
 * The lookahead trim boundary for a session — the elapsed-seconds instant past
 * which no cue may be scheduled. It is the session's TRUE completion boundary
 * (the same end the domain reports complete at), so the held-open final cycle's
 * cues still play while walkFutureCues' `>=` trim drops the cue at the boundary
 * (where the end chord fires).
 *
 *   - Stretch (segments present): getStretchCompletionSec(segments) — the cool-down's
 *     partial endSec rounded up to the cycle. The same boundary getStretchFrame's
 *     isComplete uses. Infinity (open-ended cool-down) → undefined.
 *   - HRV (no segments): getCompletionSec(plan) — totalSec rounded up to the cycle.
 *     Open-ended (totalSec === null) → undefined.
 *
 * Returning the raw endSec/totalSec here instead would silence the held-open final
 * cycle's cues (and fire the end chord mid-breath). `undefined` means "no trim"
 * (open-ended sessions never complete).
 */
export function resolveTargetSec(
  plan: BreathingPlan,
  segments: StretchSegment[] | undefined,
): number | undefined {
  if (segments !== undefined) {
    return getStretchCompletionSec(segments) ?? undefined
  }
  return getCompletionSec(plan) ?? undefined
}

export function computeBoundaryAudioOffsets(
  frame: SessionFrame,
  plan: BreathingPlan,
): BoundaryAudioOffsets {
  if (frame.cycleStartSec !== undefined) {
    const inhaleSec = frame.currentInhaleSec ?? plan.inhaleSec
    const exhaleSec = frame.currentExhaleSec ?? plan.exhaleSec

    return {
      boundaryStartSec: frame.cycleStartSec + (frame.phase === 'in' ? 0 : inhaleSec),
      phaseDurationSec: frame.phase === 'in' ? inhaleSec : exhaleSec,
    }
  }

  return {
    boundaryStartSec: frame.cycleIndex * plan.cycleSec + (frame.phase === 'in' ? 0 : plan.inhaleSec),
    phaseDurationSec: frame.phase === 'in' ? plan.inhaleSec : plan.exhaleSec,
  }
}

// ─── resolveRoundsCueAction ────────────────────────────────────────────────────

// The work block active at `cycleIndex` — the last segment whose cumulative cycle
// base has been reached (mirrors walkFutureCues' segment walk).
function activeWorkSegment(timeline: RoundsTimeline, cycleIndex: number): RoundWorkSegment {
  let active = timeline.workSegments[0]
  if (active === undefined) {
    throw new RangeError('rounds timeline has no work segments')
  }
  for (const seg of timeline.workSegments) {
    if (seg.cycleBaseIndex <= cycleIndex) active = seg
    else break
  }
  return active
}

/**
 * What the controller should do with cues for a rounds frame:
 *   - work    → top up cues for the CURRENT block only (trimmed at the block's end so
 *               the lookahead floor can't leak a cue into the rest gap).
 *   - rest    → suppress cues (silent) + ring the round-boundary end chord.
 *   - lead-in → suppress cues (the 3-2-1 is visual-only; the first In breath cue of
 *               the next block resumes audio).
 *
 * Pure — the controller dispatches the action to audio calls. roundPhase is always set
 * on a rounds frame; an absent/other value defaults to the work branch defensively.
 */
export type RoundsCueAction =
  | { kind: 'work'; cues: FutureCue[] }
  | { kind: 'rest' }
  | { kind: 'lead-in' }

export function resolveRoundsCueAction(args: {
  timeline: RoundsTimeline
  frame: SessionFrame
  audioAnchor: number
  plan: BreathingPlan
  lookaheadWindowSec: number
  minCues: number
}): RoundsCueAction {
  const { timeline, frame, audioAnchor, plan, lookaheadWindowSec, minCues } = args

  if (frame.roundPhase === 'rest') return { kind: 'rest' }
  if (frame.roundPhase === 'lead-in') return { kind: 'lead-in' }

  const active = activeWorkSegment(timeline, frame.cycleIndex)
  const cues = walkFutureCues({
    audioAnchor,
    elapsedSec: frame.elapsedSec,
    fromCycleIndex: frame.cycleIndex,
    fromPhase: frame.phase,
    plan,
    segments: timeline.workSegments,
    lookaheadWindowSec,
    minCues,
    // Trim at THIS block's cycle-aligned end so no cue is scheduled into the rest gap.
    targetSec: active.endSec,
  })
  return { kind: 'work', cues }
}
