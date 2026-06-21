import { describe, expect, it } from 'vitest'

import { DEFAULT_NK_SETTINGS, type SessionFrame } from '../domain'
import {
  getBreathingPrimaryAction,
  getBreathingPresentation,
  getNaviKriyaPresentation,
  getNaviKriyaPrimaryAction,
  getSessionPrimaryActionLabel,
} from './sessionPresentation'
import { UI_STRINGS } from '../content/strings'

// SessionFrame is seconds-shaped.
const frame: SessionFrame = {
  phase: 'in',
  phaseLabel: 'In',
  elapsedSec: 0,
  remainingSec: 600,
  phaseProgress: 0,
  cycleIndex: 0,
  isComplete: false,
}

describe('breathing presentation model', () => {
  it('uses the session cue during a running session and hides completion while in session view', () => {
    const model = getBreathingPresentation({
      phase: 'running',
      sessionCue: 'arrow',
      liveCue: 'labels',
      leadInDigit: null,
      leadInPlaceholderFrame: null,
      liveFrame: frame,
      status: 'running',
      inSessionView: true,
      bpm: 5.5,
      ratio: '40:60',
    })

    expect(model.shape).toEqual({ cue: 'arrow', frame, leadInDigit: null })
    expect(model.readout).toMatchObject({
      frame,
      status: 'running',
      isLeadInPlaceholder: false,
      showCompletionHeadline: false,
    })
  })

  it('uses the lead-in placeholder frame and live cue before the session starts', () => {
    const model = getBreathingPresentation({
      phase: 'lead-in',
      sessionCue: null,
      liveCue: 'nose',
      leadInDigit: 3,
      leadInPlaceholderFrame: frame,
      liveFrame: null,
      status: 'idle',
      inSessionView: true,
      bpm: 5.5,
      ratio: '40:60',
    })

    expect(model.shape).toEqual({ cue: 'nose', frame: null, leadInDigit: 3 })
    expect(model.readout).toMatchObject({
      frame,
      isLeadInPlaceholder: true,
    })
  })

  it('non-rounds running session has no rounds readout', () => {
    const model = getBreathingPresentation({
      phase: 'running', sessionCue: 'arrow', liveCue: 'labels', leadInDigit: null,
      leadInPlaceholderFrame: null, liveFrame: frame, status: 'running', inSessionView: true,
      bpm: 5.5, ratio: '40:60',
    })
    expect(model.readout.rounds).toBeNull()
  })
})

describe('breathing rounds presentation', () => {
  const roundsFrame = (over: Partial<SessionFrame>): SessionFrame => ({
    phase: 'in', phaseLabel: 'In', elapsedSec: 0, remainingSec: 600, phaseProgress: 0,
    cycleIndex: 0, isComplete: false,
    roundNumber: 2, roundsTotal: 3, roundPhase: 'work', restRemainingSec: 0, roundLeadInDigit: null,
    ...over,
  })

  const present = (liveFrame: SessionFrame) => getBreathingPresentation({
    phase: 'running', sessionCue: 'arrow', liveCue: 'labels', leadInDigit: null,
    leadInPlaceholderFrame: null, liveFrame, status: 'running', inSessionView: true,
    bpm: 5.5, ratio: '40:60',
  })

  it('work: orb breathes and the rounds readout reports the round', () => {
    const live = roundsFrame({ roundPhase: 'work', roundNumber: 1 })
    const model = present(live)
    expect(model.shape.frame).toBe(live)            // orb breathes during work
    expect(model.shape.leadInDigit).toBeNull()
    expect(model.readout.rounds).toEqual({ phase: 'work', restRemainingSec: 0, leadInDigit: null })
  })

  it('rest: orb idles and the rounds readout carries the rest countdown', () => {
    const model = present(roundsFrame({ roundPhase: 'rest', restRemainingSec: 42 }))
    expect(model.shape.frame).toBeNull()            // orb idle during rest
    expect(model.readout.rounds).toMatchObject({ phase: 'rest', restRemainingSec: 42 })
  })

  it('lead-in: orb shows the 3-2-1 digit, no breathing frame', () => {
    const model = present(roundsFrame({ roundPhase: 'lead-in', roundLeadInDigit: 2 }))
    expect(model.shape.frame).toBeNull()
    expect(model.shape.leadInDigit).toBe(2)
    expect(model.readout.rounds).toMatchObject({ phase: 'lead-in', leadInDigit: 2 })
  })
})

describe('Navi Kriya presentation model', () => {
  it('models the countdown state as an orb plus a front-phase readout', () => {
    const model = getNaviKriyaPresentation({
      sessionActive: true,
      starting: true,
      leadInDigit: 2,
      phase: 'idle',
      round: 1,
      count: 0,
      running: false,
      settings: DEFAULT_NK_SETTINGS,
      justCompleted: false,
      liveCue: 'labels',
    })

    expect(model.shape).toEqual({ kind: 'orb', cue: 'labels', leadInDigit: 2 })
    expect(model.readout).toEqual({
      phase: 'front',
      round: 1,
      totalRounds: DEFAULT_NK_SETTINGS.rounds,
      count: 0,
      target: DEFAULT_NK_SETTINGS.frontCount,
    })
    expect(model.showCompletionHeadline).toBe(false)
  })

  it('models a back-phase count state with the derived back target', () => {
    const model = getNaviKriyaPresentation({
      sessionActive: true,
      starting: false,
      leadInDigit: null,
      phase: 'back',
      round: 2,
      count: 12,
      running: true,
      settings: DEFAULT_NK_SETTINGS,
      justCompleted: false,
      liveCue: 'labels',
    })

    expect(model.shape).toEqual({
      kind: 'count',
      key: 'nk-12',
      count: 12,
      phase: 'back',
      isPaused: false,
    })
    expect(model.readout?.target).toBe(DEFAULT_NK_SETTINGS.frontCount / 4)
  })

  it('models completion without inventing a readout', () => {
    const model = getNaviKriyaPresentation({
      sessionActive: false,
      starting: false,
      leadInDigit: null,
      phase: 'done',
      round: 1,
      count: 0,
      running: false,
      settings: DEFAULT_NK_SETTINGS,
      justCompleted: true,
      liveCue: 'nose',
    })

    expect(model.shape).toEqual({ kind: 'orb', cue: 'nose', leadInDigit: null })
    expect(model.readout).toBeNull()
    expect(model.showCompletionHeadline).toBe(true)
  })
})

describe('Navi Kriya primary action model', () => {
  it('prioritizes cancel during countdown, then end while active, then start while idle', () => {
    expect(getNaviKriyaPrimaryAction({ starting: true, sessionActive: true, justCompleted: false })).toBe('cancel')
    expect(getNaviKriyaPrimaryAction({ starting: false, sessionActive: true, justCompleted: false })).toBe('end')
    expect(getNaviKriyaPrimaryAction({ starting: false, sessionActive: false, justCompleted: false })).toBe('start')
  })

  it('returns done when justCompleted is true and session is inactive', () => {
    expect(getNaviKriyaPrimaryAction({ starting: false, sessionActive: false, justCompleted: true })).toBe('done')
  })

  it('returns start when justCompleted is false and session is inactive (explicit signal)', () => {
    expect(getNaviKriyaPrimaryAction({ starting: false, sessionActive: false, justCompleted: false })).toBe('start')
  })

  it('returns end when sessionActive is true even if justCompleted is true (sessionActive wins)', () => {
    expect(getNaviKriyaPrimaryAction({ starting: false, sessionActive: true, justCompleted: true })).toBe('end')
  })
})

describe('breathing primary action model', () => {
  it('prioritizes end while running, then cancel during lead-in, then start while idle', () => {
    expect(getBreathingPrimaryAction({ status: 'running', inLeadIn: true })).toBe('end')
    expect(getBreathingPrimaryAction({ status: 'idle', inLeadIn: true })).toBe('cancel')
    expect(getBreathingPrimaryAction({ status: 'idle', inLeadIn: false })).toBe('start')
  })
})

describe('session primary action label', () => {
  it('maps action ids to localized control copy', () => {
    expect(getSessionPrimaryActionLabel('start', UI_STRINGS.en.practice.controls)).toBe('Start')
    expect(getSessionPrimaryActionLabel('end', UI_STRINGS.en.practice.controls)).toBe('End')
    expect(getSessionPrimaryActionLabel('cancel', UI_STRINGS['pt-BR'].practice.controls)).toBe('Cancelar')
  })
})
