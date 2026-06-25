// src/domain/stretchRamp.ts
//
// Pure-domain ramp engine for BPM Stretch sessions.
// No React, no I/O. Mirrors the sessionMath.ts / breathingPlan.ts pure-function style.
//
// Architecture: piecewise-constant segment table built once at session start.
// Each segment holds a fixed BPM for its duration. getStretchFrame looks up the
// active segment by elapsedSec and computes the frame within that segment.
// Every time-shaped identifier is seconds (number). Numeric literals use 60 for
// whole-second computations (`60 / bpm` for cycle length, `* 60` for minutes-to-seconds).

import type { StretchSettings } from './settings'
import { CLAMP_EPSILON_SEC } from './sessionMath'
import type { BreathPhase, BreathSegment, SessionFrame } from './sessionMath'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StretchStage = 'hold-initial' | 'ramp' | 'hold-target'

/**
 * One piecewise-constant BPM step.
 * cycleBaseIndex = cumulative cycles completed in ALL prior segments — ensures
 * absolute monotonic cycleIndex across the full session.
 */
// endSec is Infinity for the open-ended hold-target segment.
export interface StretchSegment extends BreathSegment {
  readonly bpm: number
  readonly stage: StretchStage
}

/**
 * Extends SessionFrame with stretch-specific live-state fields.
 * These are undefined for standard sessions (SessionFrame already declares them
 * as optional via sessionMath.ts extension).
 */
export interface StretchSessionFrame extends SessionFrame {
  readonly currentBpm: number
  readonly stage: StretchStage
  readonly cycleStartSec: number     // actual session-elapsed sec when this cycle started
  readonly currentCycleSec: number   // this cycle's duration (seconds)
  readonly currentInhaleSec: number  // this cycle's inhale duration (seconds)
  readonly currentExhaleSec: number  // this cycle's exhale duration (seconds)
}

// ─── buildStretchSegments ─────────────────────────────────────────────────────

/**
 * Builds the piecewise-constant segment table for a stretch session.
 * Accepts a single StretchSettings argument; the inhale share is read from
 * settings.inhaleShare (and settings.targetInhaleShare for the ramp).
 *
 * Step 1: warm-up hold at initialBpm for warmUpMinutes — snapped to whole cycles so
 *         the boundary lands on an Out→In transition (BPM never steps mid-breath).
 *         warmUpMinutes 0 ("Off") omits this segment so the session starts on the ramp.
 * Step 2: ramp — numSteps = ceil((initialBpm - targetBpm) / 0.4999) segments, linear
 *         BPM step i: bpm_i = initialBpm - i * (initialBpm - targetBpm) / numSteps.
 *         Every ramp step is snapped to whole cycles for the same reason.
 * Step 3: cool-down hold at targetBpm for coolDownMinutes.
 *   - 'open-ended': unbounded final segment (endSec = Infinity); residual-absorption
 *     logic does NOT apply; computeStretchTotalSec returns null.
 *   - bounded numeric coolDownMinutes: the final cool-down segment absorbs the
 *     accumulated cycle-snapping residual from Steps 1–2. Rather than snapping to
 *     whole cycles, its span is set to exactly
 *       requestedTotalSec - cursorSec
 *     where requestedTotalSec = (warmUpMinutes + rampDurationMinutes + coolDownMinutes)
 *     * 60 and cursorSec is the end of the last ramp segment. This makes the
 *     realized session total equal the requested whole-minute total exactly — honoring
 *     the user-facing contract (operator decision, plan 34-10, UAT GAP 1).
 *     The cool-down's cycleSec remains 60 / targetBpm (the true breath-cycle length),
 *     so getStretchFrame's Math.floor(elapsedInSec / cycleSec) phase math is entirely
 *     unchanged — only the cool-down SPAN shifts, not the cycle length.
 *
 * cycleBaseIndex on each segment = running sum of segment cycle counts for all prior
 * segments — absolute cycleIndex never resets across the full session.
 */
export function buildStretchSegments(settings: StretchSettings): StretchSegment[] {
  const { initialBpm, targetBpm, warmUpMinutes, coolDownMinutes, rampDurationMinutes } = settings
  // This is an exported pure function that does not call validateSettings.
  // A 0, negative, or NaN rampDurationMinutes yields a degenerate or NaN/Infinity
  // segment table. Reject it defensively so the engine never silently produces a
  // poisoned table.
  if (!Number.isFinite(rampDurationMinutes) || rampDurationMinutes <= 0) {
    throw new RangeError('rampDurationMinutes must be a positive finite number')
  }
  // Validate the BPM relationship up front so the engine never silently collapses
  // an inverted or zero-span ramp to one segment via the Math.max(1, …) numSteps
  // floor below. The !(…<…) form also trips for NaN BPMs.
  if (!(targetBpm < initialBpm)) {
    throw new RangeError('targetBpm must be strictly below initialBpm')
  }
  // The breath ratio is stretched alongside the BPM: warm-up holds the start
  // inhale share, the ramp interpolates it toward the target across the same
  // numSteps as the BPM walk, and cool-down holds the target share. When
  // targetInhaleShare === inhaleShare the interpolation is a no-op (every segment
  // gets the start inhale%), so the table is identical to the single-ratio behavior.
  // exhale% is derived as 100 - inhale%.
  const startInhalePct = settings.inhaleShare
  const targetInhalePct = settings.targetInhaleShare
  const segments: StretchSegment[] = []
  let cursorSec = 0
  let cumulativeCycles = 0

  function makeSegment(
    bpm: number,
    requestedSec: number,
    stage: StretchStage,
    inhalePct: number,
    opts?: { snap?: boolean },
  ): StretchSegment {
    const snap = opts?.snap ?? true
    const cycleSec = 60 / bpm
    const inhaleSec = cycleSec * (inhalePct / 100)
    const exhaleSec = cycleSec * ((100 - inhalePct) / 100)
    const isOpenEnded = requestedSec === Infinity
    // Snap the requested duration to a whole number of cycles so the segment
    // boundary lands on an Out→In transition (mid-cycle BPM-step bug fix).
    // When snap is false (bounded cool-down residual absorption), the requested
    // span is used verbatim — but still floored at one whole cycle so the span
    // can never be zero or negative (the snapping residual from prior
    // segments can otherwise exceed the requested cool-down span).
    const cycleCount = isOpenEnded ? 0 : Math.max(1, Math.round(requestedSec / cycleSec))
    const durationSec = isOpenEnded
      ? Infinity
      : snap
        ? cycleCount * cycleSec
        : Math.max(cycleSec, requestedSec)
    const startSec = cursorSec
    const endSec = isOpenEnded ? Infinity : cursorSec + durationSec
    const seg: StretchSegment = {
      startSec,
      endSec,
      bpm,
      cycleSec,
      inhaleSec,
      exhaleSec,
      stage,
      cycleBaseIndex: cumulativeCycles,
    }
    if (!isOpenEnded) {
      cumulativeCycles += cycleCount
      cursorSec += durationSec
    }
    return seg
  }

  // Step 1: warm-up hold at initialBpm. Omitted entirely when warmUpMinutes is 0
  // ("Off") — otherwise makeSegment's Math.max(1, …) cycle floor would inject a
  // one-breath hold instead of starting straight on the ramp. The ramp's first step
  // (i=0) is already at initialBpm, so skipping the hold still begins the session at
  // initialBpm. When present, snapped to whole cycles so the boundary lands on an
  // Out→In transition; holds the start ratio's inhale fraction.
  if (warmUpMinutes > 0) {
    segments.push(makeSegment(initialBpm, warmUpMinutes * 60, 'hold-initial', startInhalePct))
  }

  // Step 2: ramp — each step is strictly < 0.5 BPM by construction.
  // Every ramp step is also snapped to whole cycles for the same Out→In boundary reason.
  // Math.max(1, …) is a defense-in-depth floor for a legitimate near-zero-span ramp
  // (bpmSpan tiny but positive). The BPM relationship is validated up front by the
  // guard above, so this floor is no longer the primary protection against an
  // inverted or zero-span ramp.
  const bpmSpan = initialBpm - targetBpm
  const numSteps = Math.max(1, Math.ceil(bpmSpan / 0.4999))
  const stepRequestedSec = (rampDurationMinutes * 60) / numSteps

  for (let i = 0; i < numSteps; i++) {
    const stepBpm = initialBpm - i * (bpmSpan / numSteps)
    // The inhale fraction walks from start toward target on the same step grid as
    // the BPM. Like the BPM, the last ramp step sits one step short of target;
    // the target ratio is reached at the cool-down hold below.
    const stepInhalePct = startInhalePct - i * ((startInhalePct - targetInhalePct) / numSteps)
    segments.push(makeSegment(stepBpm, stepRequestedSec, 'ramp', stepInhalePct))
  }

  // Step 3: cool-down hold at targetBpm.
  if (coolDownMinutes === 'open-ended') {
    // Unbounded final segment — no residual absorption needed.
    segments.push(makeSegment(targetBpm, Infinity, 'hold-target', targetInhalePct))
  } else {
    // Bounded cool-down: span = requestedTotalSec - cursorSec absorbs the
    // cycle-snapping residual from Steps 1–2 so the realized total equals the
    // requested whole-minute total exactly. snap:false uses the span verbatim
    // (floored at one cycle) while keeping the true 60/targetBpm cycleSec, so
    // getStretchFrame's phase math is unchanged. Rationale in the docstring above.
    const requestedTotalSec = (warmUpMinutes + rampDurationMinutes + coolDownMinutes) * 60
    segments.push(makeSegment(targetBpm, requestedTotalSec - cursorSec, 'hold-target', targetInhalePct, { snap: false }))
  }

  return segments
}

// ─── getStretchFrame ──────────────────────────────────────────────────────────

/**
 * Computes the session frame at elapsedSec for a stretch session.
 *
 * Mirrors getSessionFrame in structure but uses the piecewise segment table
 * to handle variable cycle lengths. cycleIndex is absolute (session-global
 * monotonic) — never resets at segment boundaries.
 *
 * The session's true end is the last segment's endSec — buildStretchSegments
 * already snapped every segment to a whole cycle boundary, so completion and
 * remaining time are read straight off the table. An open-ended cool-down has
 * endSec = Infinity → remainingSec null, isComplete always false.
 */
export function getStretchFrame(
  segments: StretchSegment[],
  elapsedSec: number,
): StretchSessionFrame {
  const finalSegment = segments.at(-1)
  if (finalSegment === undefined) {
    throw new RangeError('getStretchFrame requires a non-empty segments array')
  }
  const safeElapsedSec = Math.max(0, elapsedSec)

  // Find the active segment (linear walk; open-ended last segment catches all remaining).
  // finalSegment is the fallback when safeElapsedSec lands at or past every segment's endSec.
  let activeSeg: StretchSegment = finalSegment
  for (const seg of segments) {
    if (safeElapsedSec < seg.endSec) {
      activeSeg = seg
      break
    }
  }

  // Hold-open boundary: for the final bounded cool-down the frame advances through
  // to completionSec (endSec rounded UP to a whole cool-down cycle), not the partial
  // endSec — so the last In/Out finishes instead of freezing mid-exhale. Earlier
  // segments use their own (already cycle-aligned) endSec. CLAMP_EPSILON_SEC pulls the
  // exact-boundary landing 1 ms inside the span so Math.floor(elapsedInSec / cycleSec)
  // stays on the last real cycle index instead of rolling one past it. The open-ended
  // final segment (endSec === Infinity, completionSec === null) is left unclamped.
  const completionSec = getStretchCompletionSec(segments)
  const segmentCeilingSec =
    activeSeg === finalSegment && completionSec !== null ? completionSec : activeSeg.endSec
  const rawElapsedInSec = safeElapsedSec - activeSeg.startSec
  const elapsedInSec =
    segmentCeilingSec === Infinity
      ? rawElapsedInSec
      : Math.min(rawElapsedInSec, segmentCeilingSec - activeSeg.startSec - CLAMP_EPSILON_SEC)
  const cycleInSegment = Math.floor(elapsedInSec / activeSeg.cycleSec)
  const absoluteCycleIndex = activeSeg.cycleBaseIndex + cycleInSegment
  const cycleStartSec = activeSeg.startSec + cycleInSegment * activeSeg.cycleSec

  // Phase within cycle
  const cycleElapsedSec = elapsedInSec - cycleInSegment * activeSeg.cycleSec
  const isInPhase = cycleElapsedSec < activeSeg.inhaleSec
  const phaseElapsedSec = isInPhase ? cycleElapsedSec : cycleElapsedSec - activeSeg.inhaleSec
  const phaseDurationSec = isInPhase ? activeSeg.inhaleSec : activeSeg.exhaleSec
  // The bounded cool-down span is no longer a whole-cycle multiple, so the final
  // cycle in that segment is a partial cycle. If it ends mid-out-phase, phaseElapsedSec
  // can exceed exhaleSec, pushing the raw ratio above 1.0 for elapsed values just
  // below endSec. Clamp to [0, 1] so shape interpolation never receives an
  // out-of-range progress value.
  const rawProgress = phaseDurationSec === 0 ? 0 : phaseElapsedSec / phaseDurationSec
  const phaseProgress = Math.min(1, Math.max(0, rawProgress))
  const phase: BreathPhase = isInPhase ? 'in' : 'out'

  // remainingSec counts down to the requested total (endSec) so the countdown still
  // reaches 0:00 there; completion is HELD to completionSec (the in-progress cool-down
  // cycle's end) so the last In/Out finishes first — mirrors HRV's getCompletionSec.
  const sessionEndSec = finalSegment.endSec
  const remainingSec = sessionEndSec === Infinity ? null : Math.max(0, sessionEndSec - safeElapsedSec)
  const isComplete = completionSec !== null && safeElapsedSec >= completionSec

  return {
    phase,
    phaseLabel: isInPhase ? 'In' : 'Out',
    elapsedSec: safeElapsedSec,
    remainingSec,
    phaseProgress,
    cycleIndex: absoluteCycleIndex,
    isComplete,
    // Stretch-specific fields
    currentBpm: activeSeg.bpm,
    stage: activeSeg.stage,
    cycleStartSec,
    currentCycleSec: activeSeg.cycleSec,
    currentInhaleSec: activeSeg.inhaleSec,
    currentExhaleSec: activeSeg.exhaleSec,
  }
}

// ─── computeStretchTotalSec ──────────────────────────────────────────────────

/**
 * Computes the total session duration from the snapped segment table produced
 * by buildStretchSegments. Returns the last segment's endSec — the same source
 * of truth that getStretchFrame's isComplete check uses — so the displayed
 * Duration agrees with the elapsed time at which the session reports complete.
 * Returns null when coolDownMinutes is 'open-ended'.
 * Accepts StretchSettings (not SessionSettings).
 */
export function computeStretchTotalSec(settings: StretchSettings): number | null {
  if (settings.coolDownMinutes === 'open-ended') return null
  const segments = buildStretchSegments(settings)
  const finalSegment = segments.at(-1)
  if (finalSegment === undefined) {
    throw new Error('buildStretchSegments returned no segments')
  }
  return finalSegment.endSec
}

// ─── getStretchCompletionSec ──────────────────────────────────────────────────

/**
 * The elapsed-seconds boundary at which a stretch session reports complete — the
 * stretch analog of getCompletionSec (sessionMath.ts). The bounded cool-down's
 * endSec is a deliberately PARTIAL final cycle (it absorbs the cycle-snapping
 * residual so the realized total equals the requested whole-minute total). Rounding
 * it UP to the next whole cool-down cycle holds completion to the END of the
 * in-progress In/Out, so the last breath and its cues are never cut.
 *
 * computeStretchTotalSec (displayed Duration) stays at the requested endSec; only
 * completion is held — exactly as HRV runs slightly past its displayed duration.
 * Returns null for open-ended cool-downs (endSec === Infinity) and empty tables.
 */
export function getStretchCompletionSec(segments: StretchSegment[]): number | null {
  const finalSegment = segments.at(-1)
  if (finalSegment === undefined || finalSegment.endSec === Infinity) return null
  const span = finalSegment.endSec - finalSegment.startSec
  return finalSegment.startSec + Math.ceil(span / finalSegment.cycleSec) * finalSegment.cycleSec
}
