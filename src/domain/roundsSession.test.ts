import { describe, expect, it } from 'vitest'

import { buildRoundsTimeline, getRoundsFrame } from './roundsSession'
import type { SessionSettings } from './settings'

// Clean geometry: bpm 6 → cycleSec 10; inhaleShare 40 → inhale 4 / exhale 6;
// durationMinutes 1 → 60 s → 6 whole cycles → 60 s work block; restMinutes 1 → 60 s;
// leadInSec 3; rounds 2.
//   work_1 [0, 60)  ·  rest [60, 120)  ·  lead-in [120, 123)  ·  work_2 [123, 183)
const BASE: SessionSettings = {
  bpm: 6,
  inhaleShare: 40,
  durationMinutes: 1,
  rounds: 2,
  restMinutes: 1,
}
const LEAD_IN = 3

describe('buildRoundsTimeline', () => {
  it('lays out work blocks with rest + lead-in gaps and continuous cycle indices', () => {
    const t = buildRoundsTimeline(BASE, LEAD_IN)
    expect(t.roundsTotal).toBe(2)
    expect(t.restSec).toBe(60)
    expect(t.leadInSec).toBe(3)
    expect(t.workSegments).toHaveLength(2)

    const [w1, w2] = t.workSegments
    expect(w1).toMatchObject({ round: 1, startSec: 0, endSec: 60, cycleSec: 10, inhaleSec: 4, exhaleSec: 6, cycleBaseIndex: 0 })
    // work_2 starts after rest (60) + lead-in (3); cycle index continues from 6.
    expect(w2).toMatchObject({ round: 2, startSec: 123, endSec: 183, cycleBaseIndex: 6 })
    expect(t.totalSec).toBe(183)
  })

  it('rounds each work block UP to whole cycles (rest starts only after the last cycle)', () => {
    // bpm 5.5 → cycleSec ≈ 10.909; 60 s → ceil(5.5) = 6 cycles → 65.4545 s block.
    const t = buildRoundsTimeline({ ...BASE, bpm: 5.5 }, LEAD_IN)
    const w1 = t.workSegments[0]
    expect(w1?.endSec).toBeCloseTo(65.4545, 3)
    // Whole number of cycles.
    expect((w1 ? w1.endSec / w1.cycleSec : 0)).toBeCloseTo(6, 6)
  })

  it('throws for non-rounds configs', () => {
    expect(() => buildRoundsTimeline({ ...BASE, rounds: 1 }, LEAD_IN)).toThrow(RangeError)
    expect(() => buildRoundsTimeline({ ...BASE, rounds: 2.5 }, LEAD_IN)).toThrow(RangeError)
    expect(() => buildRoundsTimeline({ ...BASE, durationMinutes: 'open-ended' }, LEAD_IN)).toThrow(RangeError)
    expect(() => buildRoundsTimeline({ ...BASE, restMinutes: 0 }, LEAD_IN)).toThrow(RangeError)
    expect(() => buildRoundsTimeline(BASE, -1)).toThrow(RangeError)
  })
})

describe('getRoundsFrame', () => {
  const t = buildRoundsTimeline(BASE, LEAD_IN)

  it('breathes inside a work block, reporting absolute cycle index + round', () => {
    const atStart = getRoundsFrame(t, 0)
    expect(atStart).toMatchObject({ roundPhase: 'work', roundNumber: 1, phase: 'in', cycleIndex: 0, isComplete: false })
    expect(atStart.remainingSec).toBe(183)
    // workRemainingSec counts down the current round (60 s block), not the practice.
    expect(atStart.workRemainingSec).toBe(60)
    expect(getRoundsFrame(t, 25).workRemainingSec).toBe(35)

    // 5 s into the first 10 s cycle → past the 4 s inhale → Out.
    expect(getRoundsFrame(t, 5)).toMatchObject({ roundPhase: 'work', phase: 'out', cycleIndex: 0 })
    // Cycle 1 starts at 10 s.
    expect(getRoundsFrame(t, 10)).toMatchObject({ phase: 'in', cycleIndex: 1 })
  })

  it('reports rest with a countdown in the gap after a block', () => {
    expect(getRoundsFrame(t, 60)).toMatchObject({ roundPhase: 'rest', roundNumber: 2, restRemainingSec: 60, workRemainingSec: 0 })
    expect(getRoundsFrame(t, 90)).toMatchObject({ roundPhase: 'rest', roundNumber: 2, restRemainingSec: 30 })
  })

  it('reports the 3-2-1 lead-in across the window after rest', () => {
    expect(getRoundsFrame(t, 120)).toMatchObject({ roundPhase: 'lead-in', roundNumber: 2, roundLeadInDigit: 3 })
    expect(getRoundsFrame(t, 121)).toMatchObject({ roundPhase: 'lead-in', roundLeadInDigit: 2 })
    expect(getRoundsFrame(t, 122.5)).toMatchObject({ roundPhase: 'lead-in', roundLeadInDigit: 1 })
  })

  it('resumes breathing for round 2 with a continuous cycle index', () => {
    expect(getRoundsFrame(t, 123)).toMatchObject({ roundPhase: 'work', roundNumber: 2, phase: 'in', cycleIndex: 6 })
  })

  it('holds completion until the final cycle ends', () => {
    expect(getRoundsFrame(t, 182.9).isComplete).toBe(false)
    expect(getRoundsFrame(t, 183)).toMatchObject({ isComplete: true, roundNumber: 2, remainingSec: 0 })
  })

  it('counts overall remaining down across rests', () => {
    expect(getRoundsFrame(t, 100).remainingSec).toBe(83)
  })

  it('work countdown starts at the configured duration and holds 0 through the rounded-up cycle', () => {
    // bpm 5.5 → block rounds up to 65.4545 s, but the readout counts the configured 60 s.
    const t55 = buildRoundsTimeline({ ...BASE, bpm: 5.5 }, LEAD_IN)
    expect(t55.workSegments[0]?.endSec).toBeCloseTo(65.4545, 3)
    expect(getRoundsFrame(t55, 0).workRemainingSec).toBe(60)
    expect(getRoundsFrame(t55, 60).workRemainingSec).toBe(0)
    // Still inside the block (last cycle finishing) — countdown stays at 0.
    expect(getRoundsFrame(t55, 64).workRemainingSec).toBe(0)
  })
})
