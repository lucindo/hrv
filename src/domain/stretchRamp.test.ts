import { describe, expect, it } from 'vitest'
import {
  buildStretchSegments,
  getStretchFrame,
  getStretchCompletionSec,
  computeStretchTotalSec,
} from './stretchRamp'
import type { StretchSegment } from './stretchRamp'
import { DEFAULT_STRETCH_SETTINGS } from './settings'
import type { StretchSettings } from './settings'

// Every time-shaped value is seconds.
// Prior ms values (60_000 / 5 * 60_000) become 60 / 5 * 60. Numeric ms
// fixtures (10_000, 600_000, etc.) divide by 1000.

// Base stretch settings fixture (valid, finite): warm-up 5 + ramp 20 + cool-down 5 = 30 min.
const baseSettings: StretchSettings = {
  inhaleShare: 40,
  targetInhaleShare: 40,
  initialBpm: 6,
  targetBpm: 4,
  warmUpMinutes: 5,
  coolDownMinutes: 5,
  rampDurationMinutes: 20,
}

// Open-ended cool-down fixture
const openEndedSettings: StretchSettings = {
  ...baseSettings,
  coolDownMinutes: 'open-ended',
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function lastSegment(segments: StretchSegment[]): StretchSegment {
  return requireValue(segments.at(-1), 'Expected at least one stretch segment')
}

describe('buildStretchSegments (single-arg, StretchSettings — D-02)', () => {
  it('produces a warm-up, ramp segments, and a cool-down', () => {
    const segs = buildStretchSegments(baseSettings)
    expect(segs.length).toBeGreaterThan(2)
    expect(segs[0]?.stage).toBe('hold-initial')
    expect(segs[segs.length - 1]?.stage).toBe('hold-target')
  })

  it('every ramp segment BPM step is strictly < 0.5 BPM (STRETCH-04, D-04)', () => {
    const segs = buildStretchSegments(baseSettings)
    const rampSegs = segs.filter(s => s.stage === 'ramp')
    expect(rampSegs.length).toBeGreaterThan(1)
    for (let i = 1; i < rampSegs.length; i++) {
      const diff = Math.abs((rampSegs[i - 1]?.bpm ?? 0) - (rampSegs[i]?.bpm ?? 0))
      expect(diff).toBeLessThan(0.5)
    }
  })

  it('ramp BPMs decrease monotonically from initialBpm toward targetBpm', () => {
    const segs = buildStretchSegments(baseSettings)
    const rampSegs = segs.filter(s => s.stage === 'ramp')
    for (let i = 1; i < rampSegs.length; i++) {
      expect(rampSegs[i]?.bpm).toBeLessThan(rampSegs[i - 1]?.bpm ?? Infinity)
    }
  })

  it('first ramp segment BPM equals initialBpm', () => {
    const segs = buildStretchSegments(baseSettings)
    const firstRamp = segs.find(s => s.stage === 'ramp')
    expect(firstRamp?.bpm).toBe(baseSettings.initialBpm)
  })

  it('last ramp segment BPM is >= targetBpm and < initialBpm', () => {
    const segs = buildStretchSegments(baseSettings)
    const rampSegs = segs.filter(s => s.stage === 'ramp')
    const lastRamp = rampSegs[rampSegs.length - 1]
    expect(lastRamp?.bpm).toBeGreaterThanOrEqual(baseSettings.targetBpm)
    expect(lastRamp?.bpm).toBeLessThan(baseSettings.initialBpm)
  })

  it('warm-up segment is always present: first segment is hold-initial at initialBpm', () => {
    const segs = buildStretchSegments(baseSettings)
    const first = segs[0]
    expect(first?.stage).toBe('hold-initial')
    expect(first?.bpm).toBe(baseSettings.initialBpm)
    // ~5 min of 6-BPM cycles (10s each) → exactly 300 sec
    expect(first?.endSec).toBe(5 * 60)
  })

  it('warmUpMinutes 0 ("Off") omits the hold: first segment is the ramp at initialBpm', () => {
    const segs = buildStretchSegments({ ...baseSettings, warmUpMinutes: 0 })
    expect(segs.some(s => s.stage === 'hold-initial')).toBe(false)
    const first = segs[0]
    expect(first?.stage).toBe('ramp')
    // Ramp step i=0 sits at initialBpm, so the session still begins there — and at t=0.
    expect(first?.bpm).toBe(baseSettings.initialBpm)
    expect(first?.startSec).toBe(0)
    // Realized total drops by the omitted 5-min warm-up: ramp 20 + cool-down 5 = 25 min.
    expect(computeStretchTotalSec({ ...baseSettings, warmUpMinutes: 0 })).toBe(25 * 60)
  })

  it('cool-down segment is always present: last segment is hold-target at targetBpm', () => {
    const segs = buildStretchSegments(baseSettings)
    const last = segs[segs.length - 1]
    expect(last?.stage).toBe('hold-target')
    expect(last?.bpm).toBe(baseSettings.targetBpm)
  })

  it('open-ended cool-down: last segment has endSec Infinity (D-03/D-11)', () => {
    const segs = buildStretchSegments(openEndedSettings)
    const last = segs[segs.length - 1]
    expect(last?.stage).toBe('hold-target')
    expect(last?.endSec).toBe(Infinity)
  })

  it('segments are contiguous: each segment startSec equals previous endSec', () => {
    const segs = buildStretchSegments(baseSettings)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]?.startSec).toBe(segs[i - 1]?.endSec)
    }
  })

  it('every NON-FINAL finite segment boundary lands on a whole cycle boundary (mid-cycle bug fix)', () => {
    // GAP-1 rework: the final cool-down segment absorbs the cycle-snapping residual
    // and is NOT required to be a whole-cycle multiple. Only warm-up and ramp segments
    // must still land on Out→In cycle boundaries so BPM never steps mid-breath.
    const segs = buildStretchSegments(baseSettings)
    const nonFinalSegs = segs.slice(0, -1)
    for (const seg of nonFinalSegs) {
      if (seg.endSec === Infinity) continue
      const cycles = (seg.endSec - seg.startSec) / seg.cycleSec
      expect(cycles).toBeCloseTo(Math.round(cycles), 6)
      expect(Math.round(cycles)).toBeGreaterThanOrEqual(1)
    }
  })

  it('cycleSec = 60 / bpm for each segment', () => {
    const segs = buildStretchSegments(baseSettings)
    for (const seg of segs) {
      expect(seg.cycleSec).toBeCloseTo(60 / seg.bpm, 5)
    }
  })

  it('inhaleSec + exhaleSec = cycleSec for each segment (ratio math)', () => {
    const segs = buildStretchSegments(baseSettings)
    for (const seg of segs) {
      expect(seg.inhaleSec + seg.exhaleSec).toBeCloseTo(seg.cycleSec, 5)
    }
  })

  it('cycleBaseIndex is 0 for the first segment and non-decreasing', () => {
    const segs = buildStretchSegments(baseSettings)
    expect(segs[0]?.cycleBaseIndex).toBe(0)
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]?.cycleBaseIndex).toBeGreaterThanOrEqual(segs[i - 1]?.cycleBaseIndex ?? 0)
    }
  })

  it('numSteps = ceil((initialBpm - targetBpm) / 0.4999) for the ramp (D-04)', () => {
    const segs = buildStretchSegments(baseSettings)
    const rampSegs = segs.filter(s => s.stage === 'ramp')
    const expectedSteps = Math.ceil((baseSettings.initialBpm - baseSettings.targetBpm) / 0.4999)
    expect(rampSegs.length).toBe(expectedSteps)
  })

  it('produces the same segment table as the old two-arg call for equivalent inputs', () => {
    // Regression: single-arg should produce same result as old buildStretchSegments(settings, ratio)
    const segs = buildStretchSegments(baseSettings)
    // Verify ratio is read internally from settings.ratio ('40:60')
    // by checking that inhaleSec:exhaleSec ratio matches 40:60
    const firstSeg = segs[0]
    expect(firstSeg).toBeDefined()
    if (firstSeg) {
      const inhaleRatio = firstSeg.inhaleSec / firstSeg.cycleSec
      expect(inhaleRatio).toBeCloseTo(0.4, 5)  // 40:60 → inhale = 40%
    }
  })

  it('DEFAULT_STRETCH_SETTINGS produces a valid segment table', () => {
    const segs = buildStretchSegments(DEFAULT_STRETCH_SETTINGS)
    expect(segs.length).toBeGreaterThan(0)
    expect(segs[0]?.stage).toBe('hold-initial')
  })

  // CR-01 defensive guard: buildStretchSegments must never silently produce an inverted ramp
  it('CR-01: throws RangeError when targetBpm > initialBpm (inverted ramp)', () => {
    expect(() => buildStretchSegments({ ...baseSettings, initialBpm: 4, targetBpm: 5 }))
      .toThrow(RangeError)
    expect(() => buildStretchSegments({ ...baseSettings, initialBpm: 4, targetBpm: 5 }))
      .toThrow('targetBpm must be strictly below initialBpm')
  })

  it('CR-01: throws RangeError when targetBpm === initialBpm (zero-span ramp)', () => {
    expect(() => buildStretchSegments({ ...baseSettings, initialBpm: 4, targetBpm: 4 }))
      .toThrow(RangeError)
    expect(() => buildStretchSegments({ ...baseSettings, initialBpm: 4, targetBpm: 4 }))
      .toThrow('targetBpm must be strictly below initialBpm')
  })

  it('CR-01: a valid down-ramp (targetBpm < initialBpm) still builds a populated segment table', () => {
    // Regression: valid settings must not be affected by the new guard
    const segs = buildStretchSegments(baseSettings)
    expect(segs.length).toBeGreaterThan(2)
    expect(segs.some(s => s.stage === 'ramp')).toBe(true)
  })

  // Regression: the bounded cool-down absorbs the upward cycle-snapping
  // residual from warm-up + ramp. For a wide, slow ramp the residual can exceed
  // the requested cool-down span — the cool-down segment span must still be
  // floored at one whole cycle (never zero or negative), and cycleIndex must
  // stay monotonic across the full session sweep.
  it('WR-01: wide slow ramp — cool-down span stays positive and cycleIndex is monotonic', () => {
    const wideSlowSettings: StretchSettings = {
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 14,
      targetBpm: 1.5,
      warmUpMinutes: 10,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    }
    const segs = buildStretchSegments(wideSlowSettings)
    const coolDown = segs[segs.length - 1] as StretchSegment

    // The cool-down segment span must be strictly positive (endSec > startSec) and
    // at least one whole cool-down cycle long — never zero or negative.
    expect(coolDown.stage).toBe('hold-target')
    expect(coolDown.endSec).toBeGreaterThan(coolDown.startSec)
    expect(coolDown.endSec - coolDown.startSec).toBeGreaterThanOrEqual(coolDown.cycleSec)

    // Segment-table contiguity invariant must hold: each segment startSec equals
    // the previous endSec (a negative-span cool-down would violate this).
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]?.startSec).toBe(segs[i - 1]?.endSec)
      const segment = requireValue(segs[i], 'Expected contiguous stretch segment')
      expect(segment.endSec).toBeGreaterThan(segment.startSec)
    }

    // cycleIndex must stay monotonic across the full session sweep.
    let lastIndex = -1
    for (let t = 0; t <= coolDown.endSec; t += 1) {
      const frame = getStretchFrame(segs, t)
      expect(frame.cycleIndex).toBeGreaterThanOrEqual(lastIndex)
      lastIndex = frame.cycleIndex
    }
  })
})

describe('getStretchFrame', () => {
  it('returns phase "in" at elapsedSec 0 with cycleIndex 0', () => {
    const segs = buildStretchSegments(baseSettings)
    const frame = getStretchFrame(segs, 0)
    expect(frame.phase).toBe('in')
    expect(frame.cycleIndex).toBe(0)
    expect(frame.isComplete).toBe(false)
  })

  it('cycleIndex is non-decreasing across an entire session sweep', () => {
    const segs = buildStretchSegments(baseSettings)
    // 1_800 sec = 30 min full session; sample half of it (matching prior fixture).
    const duration = (computeStretchTotalSec(baseSettings) ?? 1_800) * 0.5
    let lastIndex = -1
    for (let t = 0; t <= duration; t += 1) {
      const frame = getStretchFrame(segs, t)
      expect(frame.cycleIndex).toBeGreaterThanOrEqual(lastIndex)
      lastIndex = frame.cycleIndex
    }
  })

  it('cycleIndex never resets at segment boundaries (Pitfall 1 - absolute monotonic)', () => {
    const segs = buildStretchSegments(baseSettings)
    for (let i = 1; i < segs.length; i++) {
      const boundarySec = segs[i]?.startSec ?? 0
      if (boundarySec === Infinity) continue
      // 1 ms below the boundary = 0.001 sec below it (CLAMP_EPSILON_SEC parity).
      const frameBefore = getStretchFrame(segs, boundarySec - 0.001)
      const frameAt = getStretchFrame(segs, boundarySec)
      expect(frameAt.cycleIndex).toBeGreaterThanOrEqual(frameBefore.cycleIndex)
    }
  })

  it('frame carries currentBpm, stage, cycleStartSec, currentCycleSec', () => {
    const segs = buildStretchSegments(baseSettings)
    const frame = getStretchFrame(segs, 0)
    expect(frame.currentBpm).toBeDefined()
    expect(frame.stage).toBeDefined()
    expect(frame.cycleStartSec).toBeDefined()
    expect(frame.currentCycleSec).toBeDefined()
    expect(frame.currentInhaleSec).toBeDefined()
    expect(frame.currentExhaleSec).toBeDefined()
  })

  it('currentBpm at elapsedSec 0 equals initialBpm (warm-up hold)', () => {
    const segs = buildStretchSegments(baseSettings)
    expect(getStretchFrame(segs, 0).currentBpm).toBe(baseSettings.initialBpm)
  })

  // Every other getStretchFrame test samples t=0 (warm-up) or the cool-down. The
  // interior of the ramp — the per-segment BPM lookup that is the core engine behavior —
  // was never directly asserted. Sample inside a middle ramp segment.
  it('reports stage="ramp" and an interior BPM strictly between initial and target mid-ramp', () => {
    const segs = buildStretchSegments(baseSettings)
    const rampSegs = segs.filter(s => s.stage === 'ramp')
    expect(rampSegs.length).toBeGreaterThan(1)
    const mid = requireValue(
      rampSegs[Math.floor(rampSegs.length / 2)],
      'Expected a middle ramp segment',
    )
    const sampleSec = (mid.startSec + mid.endSec) / 2 // interior, away from boundaries

    const frame = getStretchFrame(segs, sampleSec)

    expect(frame.stage).toBe('ramp')
    expect(frame.currentBpm).toBe(mid.bpm) // reads the active segment's BPM
    expect(frame.currentBpm).toBeGreaterThan(baseSettings.targetBpm)
    expect(frame.currentBpm).toBeLessThan(baseSettings.initialBpm)
    expect(frame.isComplete).toBe(false)
  })

  it('stage at elapsedSec 0 is "hold-initial" (warm-up is always first)', () => {
    const segs = buildStretchSegments(baseSettings)
    expect(getStretchFrame(segs, 0).stage).toBe('hold-initial')
  })

  it('isComplete is held to the rounded cool-down cycle end, not the partial endSec', () => {
    const segs = buildStretchSegments(baseSettings)
    const endSec = (segs[segs.length - 1] as StretchSegment).endSec
    const completionSec = requireValue(getStretchCompletionSec(segs) ?? undefined, 'Expected a completion boundary')

    // endSec is the partial requested total; completion is held to the next whole
    // cool-down cycle so the last In/Out finishes (mirrors HRV's getCompletionSec).
    expect(completionSec).toBeGreaterThan(endSec)
    expect(getStretchFrame(segs, endSec).isComplete).toBe(false)
    expect(getStretchFrame(segs, completionSec - 0.001).isComplete).toBe(false)
    expect(getStretchFrame(segs, completionSec).isComplete).toBe(true)
    expect(getStretchFrame(segs, completionSec + 0.1).isComplete).toBe(true)
  })

  it('does not complete early — the cool-down runs to its rounded cycle end (CR-01 regression)', () => {
    // Drift-prone config: non-integer cycle counts in every segment.
    const driftSettings: StretchSettings = {
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 5.5,
      targetBpm: 4.5,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    }
    const segs = buildStretchSegments(driftSettings)
    const coolDown = segs[segs.length - 1] as StretchSegment
    expect(coolDown.stage).toBe('hold-target')
    const completionSec = requireValue(getStretchCompletionSec(segs) ?? undefined, 'Expected a completion boundary')
    const midCoolDown = coolDown.startSec + (coolDown.endSec - coolDown.startSec) / 2
    expect(getStretchFrame(segs, coolDown.startSec).isComplete).toBe(false)
    expect(getStretchFrame(segs, midCoolDown).isComplete).toBe(false)
    expect(getStretchFrame(segs, midCoolDown).stage).toBe('hold-target')
    expect(getStretchFrame(segs, coolDown.endSec).isComplete).toBe(false)
    expect(getStretchFrame(segs, completionSec).isComplete).toBe(true)
  })

  it('open-ended: isComplete is always false', () => {
    const segs = buildStretchSegments(openEndedSettings)
    for (const t of [0, 1, 60, 600, 3_600]) {
      expect(getStretchFrame(segs, t).isComplete).toBe(false)
    }
  })

  it('open-ended: remainingSec is always null', () => {
    const segs = buildStretchSegments(openEndedSettings)
    for (const t of [0, 1, 3_600]) {
      expect(getStretchFrame(segs, t).remainingSec).toBeNull()
    }
  })

  it('finite session: remainingSec reaches 0 exactly at the last segment endSec', () => {
    const segs = buildStretchSegments(baseSettings)
    const endSec = (segs[segs.length - 1] as StretchSegment).endSec
    expect(getStretchFrame(segs, endSec).remainingSec).toBe(0)
  })

  it('clamps negative elapsedSec to 0', () => {
    const segs = buildStretchSegments(baseSettings)
    const frame = getStretchFrame(segs, -0.5)
    expect(frame.elapsedSec).toBe(0)
    expect(frame.cycleIndex).toBe(0)
  })

  it('phaseProgress is in [0, 1] range', () => {
    const segs = buildStretchSegments(baseSettings)
    for (const t of [0, 5, 100]) {
      const frame = getStretchFrame(segs, t)
      expect(frame.phaseProgress).toBeGreaterThanOrEqual(0)
      expect(frame.phaseProgress).toBeLessThanOrEqual(1)
    }
  })

  // Regression: after the residual-absorption rework the bounded
  // cool-down span is no longer a whole-cycle multiple, so the final cycle is a
  // partial cycle. If it ends mid-out-phase the raw phaseElapsedSec / exhaleSec
  // ratio can exceed 1.0 for elapsed values just below endSec. phaseProgress must
  // be clamped to [0, 1] so the orb-animation interpolation never overshoots.
  it('WR-02: phaseProgress stays <= 1 across the final partial cycle', () => {
    const segs = buildStretchSegments(baseSettings)
    const coolDownSeg = segs[segs.length - 1] as StretchSegment
    const sessionEndSec = coolDownSeg.endSec
    const cycleSec = coolDownSeg.cycleSec

    // Sample densely across the final cycle, including points right before endSec
    // where a partial out-phase would push the raw ratio above 1.0.
    const samples: number[] = [
      sessionEndSec - 0.001,
      sessionEndSec - cycleSec / 4,
      sessionEndSec - cycleSec / 2,
    ]
    for (let t = Math.max(0, sessionEndSec - cycleSec); t < sessionEndSec; t += Math.max(0.001, cycleSec / 20)) {
      samples.push(t)
    }
    for (const t of samples) {
      const frame = getStretchFrame(segs, t)
      expect(frame.phaseProgress).toBeGreaterThanOrEqual(0)
      expect(frame.phaseProgress).toBeLessThanOrEqual(1)
    }
  })

  it('remainingSec decreases as session progresses for a finite session', () => {
    const segs = buildStretchSegments(baseSettings)
    const frame1 = getStretchFrame(segs, 0)
    const frame2 = getStretchFrame(segs, 5)
    expect(frame2.remainingSec).toBeLessThan(frame1.remainingSec ?? Infinity)
  })

  // Regression tests: verifies the clamp guards only the exact endSec landing (phantom-cycle
  // protection), NOT the whole final half-cycle.

  it('GAP-3: phaseProgress is NOT frozen during the final cycle — the orb animates the last exhale', () => {
    // Reproduce the 5-min cool-down freeze: sample the final out-phase (last exhale) and
    // confirm phaseProgress keeps advancing all the way to near 1.0 until isComplete fires.
    // With the broken clamp (segmentSpan - cycleSec/2), phaseProgress freezes at
    // ~1/6 for the entire last exhale. After the fix it should reach >= 0.95.
    //
    // GAP-1 update: after the plan 34-10 rework, the final cool-down no longer ends on a
    // whole-cycle boundary — startOfLastCycle must be computed from the cool-down start
    // (floor of span / cycleSec * cycleSec + coolDownSeg.startSec), not as sessionEndSec - cycleSec.
    const segs = buildStretchSegments(baseSettings)
    const coolDownSeg = segs[segs.length - 1] as StretchSegment
    const sessionEndSec = coolDownSeg.endSec
    const cycleSec = coolDownSeg.cycleSec
    const inhaleSec = coolDownSeg.inhaleSec

    // Compute the last cycle boundary correctly from the cool-down segment start.
    const segSpan = sessionEndSec - coolDownSeg.startSec
    const lastCycleIndexInSeg = Math.floor((segSpan - 0.001) / cycleSec)
    const startOfLastCycle = coolDownSeg.startSec + lastCycleIndexInSeg * cycleSec
    const outPhaseStartSec = startOfLastCycle + inhaleSec
    const outPhaseEndSec = sessionEndSec - 0.001 // just before isComplete fires

    // Sample 10 points across the final out-phase
    const outPhaseSamples: number[] = []
    for (let i = 0; i <= 10; i++) {
      outPhaseSamples.push(outPhaseStartSec + (i / 10) * (outPhaseEndSec - outPhaseStartSec))
    }

    const outFrames = outPhaseSamples.map(t => getStretchFrame(segs, t))

    // All frames in the final out-phase must stay in 'out' phase
    for (const f of outFrames) {
      expect(f.phase).toBe('out')
      expect(f.isComplete).toBe(false)
    }

    // phaseProgress must advance across the final out-phase.
    // The last sample is at sessionEndSec - 0.001.
    // With the fix: phaseProgress near the end should be well above 0.8 — clearly
    // advancing, not frozen at ~1/6 (=0.167) as it was with the broken clamp.
    // Note: after the GAP-1 rework the last cycle may be a partial one (the cool-down
    // absorbs the residual), so phaseProgress may not reach near 1.0 in all cases.
    const lastFrame = requireValue(outFrames.at(-1), 'Expected final out-phase frame')
    expect(lastFrame.phaseProgress).toBeGreaterThan(0.8)
  })

  it('GAP-3: remainingSec is non-increasing across the final cycle and isComplete holds until completionSec', () => {
    const segs = buildStretchSegments(baseSettings)
    const coolDownSeg = segs[segs.length - 1] as StretchSegment
    const completionSec = requireValue(getStretchCompletionSec(segs) ?? undefined, 'Expected a completion boundary')
    const cycleSec = coolDownSeg.cycleSec
    const lastCycleStartSec = completionSec - cycleSec

    const samples: number[] = []
    for (let t = lastCycleStartSec; t <= completionSec; t += Math.max(0.001, cycleSec / 10)) {
      samples.push(t)
    }
    // Ensure completionSec is included
    if (!samples.includes(completionSec)) samples.push(completionSec)
    samples.sort((a, b) => a - b)

    let lastRemaining = Infinity
    for (const t of samples) {
      const f = getStretchFrame(segs, t)
      if (t < completionSec) {
        expect(f.isComplete).toBe(false)
        const rem = f.remainingSec ?? Infinity
        expect(rem).toBeLessThanOrEqual(lastRemaining)
        lastRemaining = rem
      } else {
        // At exactly completionSec
        expect(f.isComplete).toBe(true)
        expect(f.remainingSec).toBe(0)
      }
    }
  })

  it('GAP-3 (phantom-cycle protection preserved): frame at exactly completionSec carries the last real cycle index, not one past it', () => {
    const segs = buildStretchSegments(baseSettings)
    const completionSec = requireValue(getStretchCompletionSec(segs) ?? undefined, 'Expected a completion boundary')

    // The frame just before completionSec and the frame at it must be on the same cycle index.
    const frameBefore = getStretchFrame(segs, completionSec - 0.001)
    const frameAt = getStretchFrame(segs, completionSec)

    expect(frameAt.isComplete).toBe(true)
    expect(frameAt.cycleIndex).toBe(frameBefore.cycleIndex)
  })

  it('GAP-3 (open-ended unaffected): getStretchFrame advances normally at a large elapsed for an open-ended session', () => {
    const segs = buildStretchSegments(openEndedSettings)
    const largeElapsed = 3_600 // 1 hour

    const frame1 = getStretchFrame(segs, largeElapsed)
    const frame2 = getStretchFrame(segs, largeElapsed + 1)

    // The open-ended path is never clamped — cycleIndex must advance
    expect(frame2.cycleIndex).toBeGreaterThanOrEqual(frame1.cycleIndex)
    // isComplete stays false
    expect(frame1.isComplete).toBe(false)
    expect(frame2.isComplete).toBe(false)
    // phaseProgress stays in [0,1]
    expect(frame1.phaseProgress).toBeGreaterThanOrEqual(0)
    expect(frame1.phaseProgress).toBeLessThanOrEqual(1)
  })

  it('GAP-1/GAP-3 guard: phaseProgress still advances through the final cycle of a reworked 5/5/5 table (gap-3 orb freeze NOT reintroduced)', () => {
    // After the GAP-1 rework, the final cool-down segment no longer ends on a whole-cycle
    // boundary — its span includes a partial residual cycle. This test confirms that
    // getStretchFrame's phaseProgress still advances (does not freeze) through the
    // final part of the session up to isComplete. The CLAMP_EPSILON_SEC = 0.001
    // sec clamp from plan 34-09 guards only the exact-endSec landing; any elapsed value
    // strictly below endSec flows unclamped — so phaseProgress advances freely.
    const segs = buildStretchSegments(DEFAULT_STRETCH_SETTINGS)
    const coolDownSeg = segs[segs.length - 1] as StretchSegment
    const sessionEndSec = coolDownSeg.endSec

    // sessionEndSec must equal 900 sec (the requested 15-min total) after GAP-1 fix
    expect(sessionEndSec).toBe(900)

    const cycleSec = coolDownSeg.cycleSec // 60 / 4.5 ≈ 13.333 sec

    // Sample phaseProgress at several evenly-spaced points in the final cycle.
    // The last cycle starts at: startSec + floor((span-0.001)/cycleSec)*cycleSec
    const segSpan = sessionEndSec - coolDownSeg.startSec
    const lastCycleIndex = Math.floor((segSpan - 0.001) / cycleSec) // last valid cycle
    const startOfLastCycle = coolDownSeg.startSec + lastCycleIndex * cycleSec

    // Sample 5 points across the final cycle (up to sessionEndSec - 0.001)
    const samples: number[] = []
    for (let i = 0; i <= 4; i++) {
      const t = startOfLastCycle + (i / 4) * (sessionEndSec - 0.001 - startOfLastCycle)
      samples.push(t)
    }

    const frames = samples.map(t => getStretchFrame(segs, t))

    // All sampled frames must not be complete
    for (const f of frames) {
      expect(f.isComplete).toBe(false)
    }

    // phaseProgress must advance across the samples — the last sample must have a
    // higher (or equal) phaseProgress than the first, and must NOT be frozen at
    // ~0.167 (the broken-clamp freeze value for the 40:60 ratio).
    // We check that the first and last samples differ, confirming animation advances.
    const firstFrame = requireValue(frames[0], 'Expected first sampled frame')
    const lastFrame = requireValue(frames.at(-1), 'Expected last sampled frame')
    // The last sample is further into the cycle than the first — phaseProgress must
    // be different (the orb is animating, not frozen at the same value).
    // We only assert it's not stuck at the broken-clamp freeze value (~0.167).
    expect(lastFrame.phaseProgress).not.toBeCloseTo(0.167, 1)
    // And confirm phaseProgress is in [0, 1]
    expect(lastFrame.phaseProgress).toBeGreaterThanOrEqual(0)
    expect(lastFrame.phaseProgress).toBeLessThanOrEqual(1)
    // The last sample's phaseProgress must differ from the first (animation is advancing)
    expect(lastFrame.phaseProgress).not.toBe(firstFrame.phaseProgress)

    // Completion is held past sessionEndSec to the rounded cool-down cycle end so the
    // final In/Out finishes; the countdown still reaches 0 at sessionEndSec.
    const completionSec = requireValue(getStretchCompletionSec(segs) ?? undefined, 'Expected a completion boundary')
    expect(completionSec).toBeGreaterThan(sessionEndSec)
    expect(getStretchFrame(segs, sessionEndSec).isComplete).toBe(false)
    expect(getStretchFrame(segs, sessionEndSec).remainingSec).toBe(0)
    expect(getStretchFrame(segs, completionSec - 0.001).isComplete).toBe(false)
    expect(getStretchFrame(segs, completionSec).isComplete).toBe(true)
  })
})

describe('computeStretchTotalSec (StretchSettings — D-02)', () => {
  it('equals the snapped segment table final endSec for all-finite holds (STRETCH-05)', () => {
    // The total is derived from the snapped segment table, not a raw minute sum.
    // warm-up 5 + ramp 20 + cool-down 5 = 30 min nominal; actual snapped total differs.
    const segments = buildStretchSegments(baseSettings)
    expect(computeStretchTotalSec(baseSettings)).toBe(lastSegment(segments).endSec)
  })

  it('returns null for an open-ended cool-down (D-11)', () => {
    expect(computeStretchTotalSec(openEndedSettings)).toBeNull()
  })

  it('equals the exact requested whole-minute total for the minimum 5+5+5 setting (GAP-1 fix)', () => {
    // GAP-1 rework: the final cool-down absorbs the residual so the realized total equals
    // the requested whole-minute total exactly — no longer the raw snapped segment drift.
    // DEFAULT_STRETCH_SETTINGS is the same 5.5→4.5 BPM, 5/5/5 fixture.
    const minSettings: StretchSettings = {
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 5.5,
      targetBpm: 4.5,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    }
    const requestedTotal = (5 + 5 + 5) * 60 // 900 sec
    const segments = buildStretchSegments(minSettings)
    // After GAP-1 fix: final endSec equals the requested whole-minute total exactly.
    expect(lastSegment(segments).endSec).toBe(requestedTotal)
    // computeStretchTotalSec also returns that exact total.
    expect(computeStretchTotalSec(minSettings)).toBe(requestedTotal)
    expect(computeStretchTotalSec(minSettings)).toBe(lastSegment(segments).endSec)
  })

  // CR-01 regression: computeStretchTotalSec must derive from the snapped segment
  // table (same source of truth as getStretchFrame's isComplete check), not from
  // the raw minute sum. Non-cycle-aligned BPMs produce drift between the two.
  it('CR-01: equals snapped segment table final endSec for cycle-aligned baseSettings (no regression)', () => {
    const segments = buildStretchSegments(baseSettings)
    const snappedEnd = lastSegment(segments).endSec
    expect(computeStretchTotalSec(baseSettings)).toBe(snappedEnd)
  })

  it('CR-01/GAP-1: equals the exact requested whole-minute total for non-cycle-aligned BPM (drift fixture)', () => {
    // GAP-1 rework: the cool-down absorbs the residual so the final endSec equals the requested
    // whole-minute total exactly — previously the snapped total differed from the raw minute sum.
    const driftSettings: StretchSettings = {
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 5.5,
      targetBpm: 4,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    }
    const segments = buildStretchSegments(driftSettings)
    const finalEndSec = lastSegment(segments).endSec
    // After GAP-1 fix: computeStretchTotalSec returns the exact requested whole-minute total.
    expect(computeStretchTotalSec(driftSettings)).toBe(finalEndSec)
    // After GAP-1 fix: the final endSec equals the requested whole-minute total exactly.
    const requestedTotal = (5 + 5 + 5) * 60
    expect(finalEndSec).toBe(requestedTotal)
    expect(computeStretchTotalSec(driftSettings)).toBe(requestedTotal)
  })

  // ── GAP-1 regression tests ────────────────────────────────────────────────
  // These tests verify the GAP-1 fix: the final cool-down segment absorbs the
  // accumulated cycle-snapping residual so the realized total equals the
  // requested whole-minute total exactly.

  it('GAP-1: DEFAULT_STRETCH_SETTINGS (5/5/5) final endSec equals the requested 15:00 exactly (=== 900)', () => {
    // DEFAULT_STRETCH_SETTINGS: 5.5→4.5 BPM, warm-up 5 + ramp 5 + cool-down 5 = 15 min.
    // Before fix: final endSec was 903.220 sec (15:03) due to per-segment cycle-rounding residuals.
    // After fix: final endSec must equal (5+5+5)*60 = 900 sec exactly.
    const segs = buildStretchSegments(DEFAULT_STRETCH_SETTINGS)
    const requestedTotal = (
      DEFAULT_STRETCH_SETTINGS.warmUpMinutes +
      DEFAULT_STRETCH_SETTINGS.rampDurationMinutes +
      (DEFAULT_STRETCH_SETTINGS.coolDownMinutes as number)
    ) * 60
    expect(lastSegment(segs).endSec).toBe(requestedTotal)
    expect(lastSegment(segs).endSec).toBe(900)
  })

  it('GAP-1: baseSettings (5+20+5=30 min) final endSec equals the requested 30:00 exactly (=== 1800)', () => {
    const segs = buildStretchSegments(baseSettings)
    const requestedTotal = (
      baseSettings.warmUpMinutes +
      baseSettings.rampDurationMinutes +
      (baseSettings.coolDownMinutes as number)
    ) * 60
    expect(lastSegment(segs).endSec).toBe(requestedTotal)
    expect(lastSegment(segs).endSec).toBe(1_800)
  })

  it('GAP-1: computeStretchTotalSec returns the exact requested whole-minute total for DEFAULT_STRETCH_SETTINGS', () => {
    const requestedTotal = (
      DEFAULT_STRETCH_SETTINGS.warmUpMinutes +
      DEFAULT_STRETCH_SETTINGS.rampDurationMinutes +
      (DEFAULT_STRETCH_SETTINGS.coolDownMinutes as number)
    ) * 60
    expect(computeStretchTotalSec(DEFAULT_STRETCH_SETTINGS)).toBe(requestedTotal)
    expect(computeStretchTotalSec(DEFAULT_STRETCH_SETTINGS)).toBe(900)
  })

  it('GAP-1: computeStretchTotalSec returns the exact requested whole-minute total for baseSettings', () => {
    const requestedTotal = (
      baseSettings.warmUpMinutes +
      baseSettings.rampDurationMinutes +
      (baseSettings.coolDownMinutes as number)
    ) * 60
    expect(computeStretchTotalSec(baseSettings)).toBe(requestedTotal)
    expect(computeStretchTotalSec(baseSettings)).toBe(1_800)
  })

  it('GAP-1: warm-up and every ramp segment are still whole-cycle multiples (cycle alignment preserved)', () => {
    // The GAP-1 fix must leave warm-up and ramp segments unchanged — only the
    // final bounded cool-down segment absorbs the residual and may have a non-whole
    // cycle span. All non-final segments must still be whole-cycle multiples.
    const segs = buildStretchSegments(DEFAULT_STRETCH_SETTINGS)
    const nonFinalSegs = segs.slice(0, -1) // all except the last (cool-down)
    for (const seg of nonFinalSegs) {
      if (seg.endSec === Infinity) continue
      const span = seg.endSec - seg.startSec
      const cycles = span / seg.cycleSec
      // Each non-final segment must be a whole-cycle multiple (within float epsilon)
      expect(cycles).toBeCloseTo(Math.round(cycles), 6)
      expect(Math.round(cycles)).toBeGreaterThanOrEqual(1)
    }
    // Also verify for baseSettings
    const baseSegs = buildStretchSegments(baseSettings)
    const baseNonFinalSegs = baseSegs.slice(0, -1)
    for (const seg of baseNonFinalSegs) {
      if (seg.endSec === Infinity) continue
      const span = seg.endSec - seg.startSec
      const cycles = span / seg.cycleSec
      expect(cycles).toBeCloseTo(Math.round(cycles), 6)
      expect(Math.round(cycles)).toBeGreaterThanOrEqual(1)
    }
  })

  it('GAP-1: cool-down segment cycleSec is still the true breath-cycle length (60/targetBpm)', () => {
    // The cool-down segment span absorbs the residual, but cycleSec MUST remain
    // 60 / targetBpm so getStretchFrame phase math is unchanged.
    const segs = buildStretchSegments(DEFAULT_STRETCH_SETTINGS)
    const coolDown = lastSegment(segs)
    expect(coolDown.stage).toBe('hold-target')
    expect(coolDown.cycleSec).toBeCloseTo(60 / DEFAULT_STRETCH_SETTINGS.targetBpm, 5)
  })

  it('GAP-1: open-ended cool-down still has endSec === Infinity and computeStretchTotalSec returns null (unchanged)', () => {
    const segs = buildStretchSegments(openEndedSettings)
    const coolDown = lastSegment(segs)
    expect(coolDown.stage).toBe('hold-target')
    expect(coolDown.endSec).toBe(Infinity)
    expect(computeStretchTotalSec(openEndedSettings)).toBeNull()
  })
})

describe('ratio transition — start ratio walks toward target ratio (FR-9, FR-10)', () => {
  // inhale fraction of a segment, derived from its inhale/cycle seconds.
  const inhaleFraction = (seg: StretchSegment): number => seg.inhaleSec / seg.cycleSec

  it('FR-9: targetRatio === ratio gives a uniform inhale fraction across all stages', () => {
    const segs = buildStretchSegments({
      inhaleShare: 40,
      targetInhaleShare: 40,
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    })
    for (const seg of segs) {
      expect(inhaleFraction(seg)).toBeCloseTo(0.4, 10)
    }
  })

  it('FR-10: warm-up holds start, ramp shifts monotonically by step, cool-down holds target', () => {
    const segs = buildStretchSegments({
      inhaleShare: 50,     // 50% inhale
      targetInhaleShare: 20, // 20% inhale
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    })
    const warmUp = requireValue(segs[0], 'Expected warm-up segment')
    const ramp = segs.filter((s) => s.stage === 'ramp')
    const coolDown = lastSegment(segs)

    expect(warmUp.stage).toBe('hold-initial')
    expect(inhaleFraction(warmUp)).toBeCloseTo(0.5, 10)
    expect(inhaleFraction(coolDown)).toBeCloseTo(0.2, 10)

    // First ramp step equals the start ratio (i=0); subsequent steps strictly
    // decrease and stay within the [target, start] band.
    expect(inhaleFraction(ramp[0] as StretchSegment)).toBeCloseTo(0.5, 10)
    for (let i = 1; i < ramp.length; i++) {
      const prev = inhaleFraction(ramp[i - 1] as StretchSegment)
      const cur = inhaleFraction(ramp[i] as StretchSegment)
      expect(cur).toBeLessThan(prev)
      expect(cur).toBeGreaterThanOrEqual(0.2)
      expect(cur).toBeLessThanOrEqual(0.5)
    }
  })

  it('FR-11: a target ratio with MORE inhale than start walks the inhale fraction upward', () => {
    const segs = buildStretchSegments({
      inhaleShare: 20,     // 20% inhale
      targetInhaleShare: 50, // 50% inhale
      initialBpm: 6,
      targetBpm: 4,
      warmUpMinutes: 5,
      rampDurationMinutes: 5,
      coolDownMinutes: 5,
    })
    const warmUp = requireValue(segs[0], 'Expected warm-up segment')
    const coolDown = lastSegment(segs)
    const ramp = segs.filter((s) => s.stage === 'ramp')

    expect(inhaleFraction(warmUp)).toBeCloseTo(0.2, 10)
    expect(inhaleFraction(coolDown)).toBeCloseTo(0.5, 10)
    for (let i = 1; i < ramp.length; i++) {
      expect(inhaleFraction(ramp[i] as StretchSegment)).toBeGreaterThan(
        inhaleFraction(ramp[i - 1] as StretchSegment),
      )
    }
  })
})
