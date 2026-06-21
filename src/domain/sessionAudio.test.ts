import { describe, expect, it } from 'vitest'

import { LOOKAHEAD_MIN_CUES, LOOKAHEAD_WINDOW_SEC } from '../audio/audioEngine'
import type { BreathingPlan } from './breathingPlan'
import { createBreathingPlan } from './breathingPlan'
import { buildRoundsTimeline, getRoundsFrame } from './roundsSession'
import { computeBoundaryAudioOffsets, resolveRoundsCueAction, resolveTargetSec, walkFutureCues, MAX_WALK_ITERATIONS } from './sessionAudio'
import { getCompletionSec, type SessionFrame } from './sessionMath'
import { DEFAULT_SETTINGS, type SessionSettings } from './settings'
import type { StretchSegment } from './stretchRamp'

// Fixture values are seconds-shaped.
const plan: BreathingPlan = {
  bpm: 5.5,
  inhaleShare: 40,
  cycleSec: 10.909,
  inhaleSec: 4.363,
  exhaleSec: 6.545,
  totalSec: null,
}

const baseFrame: SessionFrame = {
  phase: 'in',
  phaseLabel: 'In',
  elapsedSec: 0,
  remainingSec: null,
  phaseProgress: 0,
  cycleIndex: 3,
  isComplete: false,
}

// ─── walkFutureCues tests ────────────────────────────────────────────────────

// HRV fixture plan: 10 BPM (cycleSec=6, inhale=3, exhale=3)
const hrvPlan: BreathingPlan = {
  bpm: 10,
  inhaleShare: 50,
  cycleSec: 6,
  inhaleSec: 3,
  exhaleSec: 3,
  totalSec: null,
}

// Two-segment Stretch fixture for boundary-crossing tests
const stretchSegs: StretchSegment[] = [
  {
    startSec: 0,
    endSec: 30,
    bpm: 10,
    cycleSec: 6,
    inhaleSec: 3,
    exhaleSec: 3,
    stage: 'hold-initial',
    cycleBaseIndex: 0,
  },
  {
    startSec: 30,
    endSec: Infinity,
    bpm: 6,
    cycleSec: 10,
    inhaleSec: 4,
    exhaleSec: 6,
    stage: 'hold-target',
    cycleBaseIndex: 5,
  },
]

describe('Phase 52 D-01/D-11/D-14 walkFutureCues', () => {
  // Test 1: HRV walk basic — at 10 BPM (cycleSec=6), floor=2, window=6s
  it('HRV basic walk returns ≥LOOKAHEAD_MIN_CUES cues starting at anchor+0 for fromPhase=in', () => {
    const anchor = 100
    const cues = walkFutureCues({
      audioAnchor: anchor,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: hrvPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })

    expect(cues.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
    // First cue at audioAnchor + 0 (cycleIndex=0, phase=in)
    expect(cues[0]).toEqual({ audioTime: anchor + 0, phaseDurationSec: 3, kind: 'in' })
    // Second cue at audioAnchor + 3 (exhale)
    expect(cues[1]).toEqual({ audioTime: anchor + 3, phaseDurationSec: 3, kind: 'out' })
    // Third cue at audioAnchor + 6 (next cycle inhale) — included since LOOKAHEAD_WINDOW_SEC=6
    if (cues.length >= 3) {
      expect(cues[2]).toEqual({ audioTime: anchor + 6, phaseDurationSec: 3, kind: 'in' })
    }
    // AudioTimes must be monotonically increasing
    for (let i = 1; i < cues.length; i++) {
      const prevTime = cues[i - 1]?.audioTime ?? 0
      const currTime = cues[i]?.audioTime ?? 0
      expect(currTime).toBeGreaterThan(prevTime)
    }
  })

  // Test 2: HRV low-BPM floor — at 1 BPM (cycleSec=60), window yields 0 cues; floor returns 2
  it('HRV low-BPM floor: 1 BPM returns exactly LOOKAHEAD_MIN_CUES cues', () => {
    const lowBpmPlan: BreathingPlan = {
      bpm: 1,
      inhaleShare: 40,
      cycleSec: 60,
      inhaleSec: 24,
      exhaleSec: 36,
      totalSec: null,
    }
    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: lowBpmPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })
    // Floor: even though the window (6s) doesn't reach the next cycle (60s),
    // the floor kicks in and returns LOOKAHEAD_MIN_CUES cues
    expect(cues.length).toBe(LOOKAHEAD_MIN_CUES)
    expect(cues[0]?.kind).toBe('in')
    expect(cues[1]?.kind).toBe('out')
  })

  // Test 3: HRV high-BPM window-wins — at 7 BPM (cycleSec≈8.57), no duplicates, monotonic times
  it('HRV high-BPM: no duplicate cues, monotonically increasing audioTimes', () => {
    const highBpmPlan: BreathingPlan = {
      bpm: 7,
      inhaleShare: 40,
      cycleSec: 60 / 7,
      inhaleSec: (60 / 7) * 0.4,
      exhaleSec: (60 / 7) * 0.6,
      totalSec: null,
    }
    const cues = walkFutureCues({
      audioAnchor: 50,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: highBpmPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })
    expect(cues.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
    // No duplicate audioTimes
    const audioTimes = cues.map(c => c.audioTime)
    const uniqueTimes = new Set(audioTimes)
    expect(uniqueTimes.size).toBe(audioTimes.length)
    // Monotonically increasing
    for (let i = 1; i < cues.length; i++) {
      const prevTime = cues[i - 1]?.audioTime ?? 0
      const currTime = cues[i]?.audioTime ?? 0
      expect(currTime).toBeGreaterThan(prevTime)
    }
  })

  // Test 4: Stretch walk basic — crosses the segment boundary at 30s (cue ~27s is out in seg0, cue at 30s is in seg1)
  it('Stretch basic walk crosses segment boundary with correct per-segment phaseDuration', () => {
    // anchor=100, fromCycleIndex=4 (cycle 4 starts at 24s in seg0), fromPhase='out'
    // cycle 4 starts at startSec=0 + 4*6 = 24s; out phase starts at 24+3=27s
    const anchor = 100
    const cues = walkFutureCues({
      audioAnchor: anchor,
      elapsedSec: 27,  // currently at cycle 4 exhale
      fromCycleIndex: 4,
      fromPhase: 'out',
      plan: { bpm: 10, inhaleShare: 50, cycleSec: 6, inhaleSec: 3, exhaleSec: 3, totalSec: null },
      segments: stretchSegs,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })
    expect(cues.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
    // First cue: audioTime = anchor + 27, phaseDurationSec from seg0 = 3, kind='out'
    expect(cues[0]).toEqual({ audioTime: anchor + 27, phaseDurationSec: 3, kind: 'out' })
    // Second cue: audioTime = anchor + 30, crosses to seg1 (inhaleSec=4), kind='in'
    expect(cues[1]).toEqual({ audioTime: anchor + 30, phaseDurationSec: 4, kind: 'in' })
    if (cues.length >= 3) {
      // Third cue: audioTime = anchor + 34, seg1 exhaleSec=6, kind='out'
      expect(cues[2]).toEqual({ audioTime: anchor + 34, phaseDurationSec: 6, kind: 'out' })
    }
  })

  // Test 5: Stretch open-ended last segment — continues using final segment's cycleSec
  it('Stretch open-ended last segment: walk uses final segment cycleSec for all further cues', () => {
    const anchor = 200
    const cues = walkFutureCues({
      audioAnchor: anchor,
      elapsedSec: 40,  // deep in the open-ended second segment (startSec=30, Infinity)
      fromCycleIndex: 6,
      fromPhase: 'in',
      plan: { bpm: 6, inhaleShare: 40, cycleSec: 10, inhaleSec: 4, exhaleSec: 6, totalSec: null },
      segments: stretchSegs,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })
    expect(cues.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
    // All cues should use seg1 phaseDurations (inhale=4, exhale=6) since we're past startSec=30
    for (const cue of cues) {
      if (cue.kind === 'in') expect(cue.phaseDurationSec).toBe(4)
      else expect(cue.phaseDurationSec).toBe(6)
    }
  })

  // Test 6: targetSec trim — timed session, floor does NOT override the trim
  it('targetSec trim: no cue queued past audioAnchor+targetSec even with floor', () => {
    const anchor = 0
    // 5-min session (targetSec=300), current elapsed=298, window would want 6s ahead
    const cues = walkFutureCues({
      audioAnchor: anchor,
      elapsedSec: 298,
      fromCycleIndex: 49,  // approximate cycle at 298s with cycleSec=6
      fromPhase: 'in',
      plan: { ...hrvPlan, totalSec: 300 },
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: 300,
    })
    // Every cue must have audioTime <= audioAnchor + targetSec
    for (const cue of cues) {
      expect(cue.audioTime).toBeLessThanOrEqual(anchor + 300)
    }
    // Floor does NOT override target — may return fewer than LOOKAHEAD_MIN_CUES
    // The cycle at index 49: audioTimeRelSec = 49*6 = 294 (in), 294+3=297 (out)
    // Next cycle at 300 is exactly at targetSec — may or may not be included but must not exceed
    for (const cue of cues) {
      expect(cue.audioTime).toBeLessThanOrEqual(300)
    }
  })

  // Test 6b: the boundary is EXCLUSIVE — a cue starting exactly at targetSec is the
  // onset of the next cycle and must NOT be emitted. For cycle-aligned durations that
  // instant is where the end chord plays; emitting it overlaps the breath cue with the
  // session-end sound (regression: the inhale cue used to fire on top of the end chord).
  // The trim wins over the minCues floor: the walk emits zero cues, not the floor of 2.
  it('targetSec trim excludes the cue at the session end (no overlap with end chord)', () => {
    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 300, // at the very end of a 5-min session
      fromCycleIndex: 50, // 50 * cycleSec(6) = 300s — inhale onset exactly at targetSec
      fromPhase: 'in',
      plan: { ...hrvPlan, totalSec: 300 },
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: 300,
    })
    expect(cues).toEqual([]) // the cue at targetSec is excluded — floor does not re-inflate
    expect(LOOKAHEAD_MIN_CUES).toBeGreaterThan(1) // sanity: the floor really is above 1
  })

  // Test 7: targetSec=undefined (open-ended) — no end trim
  it('targetSec=undefined (open-ended): emits up to max(floor,window) cues with no trim', () => {
    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: hrvPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: undefined,
    })
    // Should return at least LOOKAHEAD_MIN_CUES cues (open-ended, no trim)
    expect(cues.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
  })

  // Test 8: empty walk — fromCycleIndex already past targetSec returns []
  it('empty walk: returns [] when start position already past targetSec', () => {
    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 310,
      fromCycleIndex: 52,  // 52*6=312 > targetSec=300
      fromPhase: 'in',
      plan: { ...hrvPlan, totalSec: 300 },
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: 300,
    })
    expect(cues).toEqual([])
  })

  // Test 9: Stretch cycleBaseIndex invariant — crossing segment boundary preserves monotonic cycleIndex
  it('Stretch cycleBaseIndex invariant: walk across segment boundaries uses correct activeSeg', () => {
    // Segments: seg0 ends at cycle 5 (cycleBaseIndex=0, 5 cycles total: 0-4),
    //           seg1 starts at cycleBaseIndex=5
    // Walking from cycleIndex=4 (last cycle of seg0) phase='in' to seg1
    const anchor = 50
    const cues = walkFutureCues({
      audioAnchor: anchor,
      elapsedSec: 24,  // cycle 4, inhale (4*6=24)
      fromCycleIndex: 4,
      fromPhase: 'in',
      plan: { bpm: 10, inhaleShare: 50, cycleSec: 6, inhaleSec: 3, exhaleSec: 3, totalSec: null },
      segments: stretchSegs,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })
    // cycle 4 in: audioTimeRelSec=24, seg0 inhaleSec=3
    expect(cues[0]).toEqual({ audioTime: anchor + 24, phaseDurationSec: 3, kind: 'in' })
    // cycle 4 out: audioTimeRelSec=27, seg0 exhaleSec=3
    expect(cues[1]).toEqual({ audioTime: anchor + 27, phaseDurationSec: 3, kind: 'out' })
    // cycle 5 (seg1): audioTimeRelSec=30, seg1 inhaleSec=4
    if (cues.length >= 3) {
      expect(cues[2]).toEqual({ audioTime: anchor + 30, phaseDurationSec: 4, kind: 'in' })
    }
  })

})

// Regression: the lookahead must trim at the session's TRUE completion boundary
// (HRV: getCompletionSec — totalSec rounded UP to the cycle; Stretch: the final
// segment's endSec), NOT the raw plan.totalSec. Trimming at totalSec silenced the
// held-open final cycle's breath cues; the >= trim then drops the boundary cue so
// it never overlaps the end chord.
describe('session-end boundary trim: held-open final breath plays, no end-chord overlap', () => {
  // HRV non-aligned: 5-min (300s) session on a 14s cycle (in7/out7). The domain
  // holds completion to ceil(300/14)*14 = 308s, so the final cycle 21 (294→308)
  // animates past 300. Trimming at totalSec=300 silenced its out cue (301>300);
  // trimming at the completion boundary (308) keeps the final out audible while
  // dropping the inhale that starts exactly at 308 (where the end chord plays).
  it('HRV: final held-open exhale plays, inhale at the completion boundary is dropped', () => {
    const nonAlignedPlan: BreathingPlan = {
      bpm: 60 / 14,
      inhaleShare: 50,
      cycleSec: 14,
      inhaleSec: 7,
      exhaleSec: 7,
      totalSec: 300,
    }
    const targetSec = getCompletionSec(nonAlignedPlan) // 308 — the controller's new source
    expect(targetSec).toBe(308)

    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 301, // start of the final exhale (cycle 21 out: 294 + 7)
      fromCycleIndex: 21,
      fromPhase: 'out',
      plan: nonAlignedPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: targetSec ?? undefined,
    })

    // The held-open final exhale is audible (regression: it used to be trimmed at 300).
    expect(cues).toContainEqual({ audioTime: 301, phaseDurationSec: 7, kind: 'out' })
    // No cue is emitted at or past the completion boundary (308 = where the end chord plays).
    expect(cues.every(c => c.audioTime < 308)).toBe(true)
  })

  // Stretch: a bounded segment whose span is NOT a whole-cycle multiple, so the
  // final cycle is partial and ends mid-out (stretchRamp deliberately allows this).
  // The trim must use the segment's endSec — the source getStretchFrame's isComplete
  // uses — not the unrelated resonant-tab plan.totalSec. seg span 25s, cycleSec 10
  // (in4/out6): final cycle 20→30 is cut at 25 (mid-exhale).
  it('Stretch: final partial-cycle cues play, nothing emitted at or past the segment end', () => {
    const boundedSeg: StretchSegment = {
      startSec: 0,
      endSec: 25, // partial final cycle (20→30 cut at 25)
      bpm: 6,
      cycleSec: 10,
      inhaleSec: 4,
      exhaleSec: 6,
      stage: 'hold-target',
      cycleBaseIndex: 0,
    }
    const segments = [boundedSeg]
    const targetSec = segments.at(-1)?.endSec // 25 — the controller's new stretch source
    expect(targetSec).toBe(25)

    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 20, // start of the final (partial) cycle
      fromCycleIndex: 2, // 2 * 10 = 20s
      fromPhase: 'in',
      plan: hrvPlan, // plan is ignored for phase durations when segments are provided
      segments,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec,
    })

    // Both phases of the partial final cycle are audible: in@20 and out@24 (< endSec 25).
    expect(cues).toContainEqual({ audioTime: 20, phaseDurationSec: 4, kind: 'in' })
    expect(cues).toContainEqual({ audioTime: 24, phaseDurationSec: 6, kind: 'out' })
    // The next cycle's inhale (audioTimeRelSec 30) is past the end and must be dropped.
    expect(cues.every(c => c.audioTime < 25)).toBe(true)
  })
})

// resolveTargetSec is the lookahead trim boundary the controller feeds walkFutureCues.
// These pin the wiring that the bug lived in: it MUST source the true completion
// boundary (HRV: getCompletionSec; Stretch: getStretchCompletionSec), never plan.totalSec.
describe('resolveTargetSec', () => {
  it('HRV timed: returns the rounded completion boundary, not the raw totalSec', () => {
    // 14s cycle, 300s total → ceil(300/14)*14 = 308 (held-open final cycle).
    const plan: BreathingPlan = { bpm: 60 / 14, inhaleShare: 50, cycleSec: 14, inhaleSec: 7, exhaleSec: 7, totalSec: 300 }
    expect(resolveTargetSec(plan, undefined)).toBe(308)
  })

  it('HRV open-ended: returns undefined (no trim)', () => {
    expect(resolveTargetSec(hrvPlan, undefined)).toBeUndefined() // hrvPlan.totalSec === null
  })

  it('Stretch bounded: returns the cool-down endSec rounded up to a whole cycle', () => {
    // endSec 25 sits mid-cycle (cycleSec 10) → completion held to ceil(25/10)*10 = 30.
    const segs: StretchSegment[] = [
      { startSec: 0, endSec: 25, bpm: 6, cycleSec: 10, inhaleSec: 4, exhaleSec: 6, stage: 'hold-target', cycleBaseIndex: 0 },
    ]
    expect(resolveTargetSec(hrvPlan, segs)).toBe(30)
  })

  it('Stretch open-ended (endSec Infinity): returns undefined (no trim)', () => {
    const segs: StretchSegment[] = [
      { startSec: 0, endSec: Infinity, bpm: 6, cycleSec: 10, inhaleSec: 4, exhaleSec: 6, stage: 'hold-target', cycleBaseIndex: 0 },
    ]
    expect(resolveTargetSec(hrvPlan, segs)).toBeUndefined()
  })

  it('Stretch takes precedence over the (resonant) plan — the regression guard', () => {
    // A timed resonant plan AND stretch segments: the trim must use the stretch
    // completion boundary (ceil(25/10)*10 = 30), NOT the resonant plan.totalSec (300).
    // Reverting to plan.totalSec here is exactly what silenced a stretch session's final minutes.
    const timedResonant: BreathingPlan = { bpm: 6, inhaleShare: 50, cycleSec: 10, inhaleSec: 5, exhaleSec: 5, totalSec: 300 }
    const segs: StretchSegment[] = [
      { startSec: 0, endSec: 25, bpm: 6, cycleSec: 10, inhaleSec: 4, exhaleSec: 6, stage: 'hold-target', cycleBaseIndex: 0 },
    ]
    expect(resolveTargetSec(timedResonant, segs)).toBe(30)
  })
})

// Hard iteration cap on walkFutureCues: verifies a degenerate plan (cycleSec > 0,
// targetSec=undefined, inhaleSec=0) terminates at MAX_WALK_ITERATIONS instead of looping forever.
// Without the cap, 6/1e-9 = 6e9 iterations would hang.
describe('Phase 52 Plan 06 WR-01: walkFutureCues hard iteration cap', () => {
  it('degenerate plan terminates within MAX_WALK_ITERATIONS cap instead of looping forever', () => {
    // cycleSec=1e-9 (near-zero positive, passes cycleSec > 0 guard).
    // inhaleSec=0 → phaseOffset for 'out' = inhaleSec = 0 too.
    // audioTimeRelSec per cue = cycleIndex * 1e-9.
    // windowEnd = elapsedSec + LOOKAHEAD_WINDOW_SEC = 0 + 6 → needs 6e9 iterations to exit normally.
    // Without the cap this hangs the rAF tick. With the cap it returns in ≤ MAX_WALK_ITERATIONS.
    const degeneratePlan: BreathingPlan = {
      bpm: 1,
      inhaleShare: 50,
      cycleSec: 1e-9,  // near-zero positive — passes cycleSec > 0 guard
      inhaleSec: 0,
      exhaleSec: 0,
      totalSec: null,  // open-ended — no targetSec exit
    }

    // Must complete before the vitest test timeout (no hang)
    const start = performance.now()
    const cues = walkFutureCues({
      audioAnchor: 0,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: degeneratePlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec: undefined,
    })
    const elapsed = performance.now() - start

    // Must terminate well under 1s — the cap prevents the infinite loop
    expect(elapsed).toBeLessThan(500)
    // Result length bounded by MAX_WALK_ITERATIONS (symbol, not literal).
    expect(cues.length).toBeGreaterThan(0)
    expect(cues.length).toBeLessThanOrEqual(MAX_WALK_ITERATIONS)
  })

  it('normal HRV plan output is unchanged with iteration cap (regression)', () => {
    // Verify that a well-formed plan produces the same cue sequence as before the cap.
    // The cap must NOT affect normal operation (10 BPM, window=6s produces ~3 cues).
    const normalPlan: BreathingPlan = {
      bpm: 10,
      inhaleShare: 50,
      cycleSec: 6,
      inhaleSec: 3,
      exhaleSec: 3,
      totalSec: null,
    }

    const cuesWithCap = walkFutureCues({
      audioAnchor: 100,
      elapsedSec: 0,
      fromCycleIndex: 0,
      fromPhase: 'in',
      plan: normalPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })

    // Output should be same as Test 1 in the existing suite (byte-for-byte regression)
    expect(cuesWithCap.length).toBeGreaterThanOrEqual(LOOKAHEAD_MIN_CUES)
    expect(cuesWithCap[0]).toEqual({ audioTime: 100 + 0, phaseDurationSec: 3, kind: 'in' })
    expect(cuesWithCap[1]).toEqual({ audioTime: 100 + 3, phaseDurationSec: 3, kind: 'out' })
    // Monotonically increasing times
    for (let i = 1; i < cuesWithCap.length; i++) {
      const prevTime = cuesWithCap[i - 1]?.audioTime ?? 0
      const currTime = cuesWithCap[i]?.audioTime ?? 0
      expect(currTime).toBeGreaterThan(prevTime)
    }
  })
})

describe('computeBoundaryAudioOffsets', () => {
  it('uses constant-plan timing for standard In frames', () => {
    const out = computeBoundaryAudioOffsets({ ...baseFrame, phase: 'in' }, plan)

    expect(out.boundaryStartSec).toBe(3 * plan.cycleSec)
    // phaseDurationSec is plan.inhaleSec directly (no `/1000`).
    expect(out.phaseDurationSec).toBe(plan.inhaleSec)
  })

  it('uses constant-plan timing for standard Out frames', () => {
    const out = computeBoundaryAudioOffsets({ ...baseFrame, phase: 'out' }, plan)

    expect(out.boundaryStartSec).toBe(3 * plan.cycleSec + plan.inhaleSec)
    expect(out.phaseDurationSec).toBe(plan.exhaleSec)
  })

  it('uses per-cycle timing carried by stretch In frames', () => {
    const stretchFrame: SessionFrame = {
      ...baseFrame,
      phase: 'in',
      cycleIndex: 5,
      cycleStartSec: 55,
      currentCycleSec: 10,
      currentInhaleSec: 4,
      currentExhaleSec: 6,
      currentBpm: 6,
      stage: 'ramp',
    }

    const out = computeBoundaryAudioOffsets(stretchFrame, plan)

    expect(out.boundaryStartSec).toBe(55)
    expect(out.phaseDurationSec).toBe(4)
  })

  it('uses per-cycle timing carried by stretch Out frames', () => {
    const stretchFrame: SessionFrame = {
      ...baseFrame,
      phase: 'out',
      cycleIndex: 5,
      cycleStartSec: 55,
      currentCycleSec: 10,
      currentInhaleSec: 4,
      currentExhaleSec: 6,
      currentBpm: 6,
      stage: 'ramp',
    }

    const out = computeBoundaryAudioOffsets(stretchFrame, plan)

    expect(out.boundaryStartSec).toBe(59)
    expect(out.phaseDurationSec).toBe(6)
  })
})

describe('resolveRoundsCueAction', () => {
  // bpm 6 → cycleSec 10; durationMinutes 5 → 300 s block; rounds 2; restMinutes 1; leadIn 3.
  //   work_1 [0,300) · rest [300,360) · lead-in [360,363) · work_2 [363,663)
  const roundsSettings: SessionSettings = {
    ...DEFAULT_SETTINGS, bpm: 6, inhaleShare: 40, durationMinutes: 5, rounds: 2, restMinutes: 1,
  }
  const timeline = buildRoundsTimeline(roundsSettings, 3)
  const roundsPlan = createBreathingPlan(roundsSettings)
  const ANCHOR = 1000

  const actionAt = (elapsedSec: number) =>
    resolveRoundsCueAction({
      timeline,
      frame: getRoundsFrame(timeline, elapsedSec),
      audioAnchor: ANCHOR,
      plan: roundsPlan,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
    })

  it('tops up work cues for the active block, never leaking into the rest gap', () => {
    const action = actionAt(0)
    expect(action.kind).toBe('work')
    if (action.kind !== 'work') throw new Error('expected work')
    expect(action.cues.length).toBeGreaterThan(0)
    // Every cue stays inside block_1 — none reaches the rest gap or block_2 (>= ANCHOR+363).
    const maxAudioTime = Math.max(...action.cues.map((c) => c.audioTime))
    expect(maxAudioTime).toBeLessThan(ANCHOR + 300)
  })

  it('does not schedule the next block early near the end of a block (floor cannot leak)', () => {
    // 295 s in — only the tail of block_1 remains; the min-cue floor must NOT pull a
    // block_2 cue forward across the 60 s rest gap.
    const action = actionAt(295)
    if (action.kind !== 'work') throw new Error('expected work')
    for (const cue of action.cues) {
      expect(cue.audioTime).toBeLessThan(ANCHOR + 300)
    }
  })

  it('suppresses cues and signals the boundary during rest', () => {
    expect(actionAt(320)).toEqual({ kind: 'rest' })
  })

  it('schedules the 3-2-1 ticks during the lead-in (start of the lead-in window)', () => {
    // lead-in window for block_2 is [360, 363); ticks start at block.start − leadIn = 363 − 3.
    expect(actionAt(361)).toEqual({ kind: 'lead-in', ticksStartAudioTime: ANCHOR + 360 })
  })

  it('resumes work cues for the second block after the gap', () => {
    const action = actionAt(363)
    expect(action.kind).toBe('work')
    if (action.kind !== 'work') throw new Error('expected work')
    // Cues belong to block_2 — at or past its start, before its end.
    const minAudioTime = Math.min(...action.cues.map((c) => c.audioTime))
    expect(minAudioTime).toBeGreaterThanOrEqual(ANCHOR + 363)
    expect(Math.max(...action.cues.map((c) => c.audioTime))).toBeLessThan(ANCHOR + 663)
  })
})
