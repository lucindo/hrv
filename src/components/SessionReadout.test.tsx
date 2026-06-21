import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SessionFrame } from '../domain'
import { SessionReadout } from './SessionReadout'
import { UI_STRINGS } from '../content/strings'
import type { UiStrings } from '../content/strings'

const EN_STRINGS_FIXTURE = UI_STRINGS.en
const EN_FORM_FIXTURE = EN_STRINGS_FIXTURE.practice.settingsForm

// Sample frame with a non-null remainingSec for timed session scenarios.
// 600 sec remaining → formatDuration renders "10:00".
const sampleFrame: SessionFrame = {
  phase: 'in',
  phaseLabel: 'In',
  elapsedSec: 0,
  remainingSec: 600,
  phaseProgress: 0,
  cycleIndex: 0,
  isComplete: false,
}

// Stretch-shaped frame: SessionFrame carrying the optional stretch live-state fields.
// Prior ms fixture values (10_909 / 4_363 / 6_545) divide by 1000.
const stretchFrame: SessionFrame = {
  phase: 'in',
  phaseLabel: 'In',
  elapsedSec: 0,
  remainingSec: 600,
  phaseProgress: 0,
  cycleIndex: 0,
  isComplete: false,
  currentBpm: 5.5,
  stage: 'ramp',
  cycleStartSec: 0,
  currentCycleSec: 10.909,
  currentInhaleSec: 4.363,
  currentExhaleSec: 6.545,
}

interface RenderReadoutProps {
  mode?: 'lead-in' | 'session'
  frame?: SessionFrame | null
  status?: 'idle' | 'running' | 'complete'
  showCompletionHeadline?: boolean
  strings?: UiStrings['practice']['readout']
  bpm?: number
  ratio?: string
}

function renderReadout(props: RenderReadoutProps = {}) {
  const strings = props.strings ?? EN_STRINGS_FIXTURE.practice.readout
  const frame = props.frame ?? null
  const bpm = props.bpm ?? 5.5
  const ratio = props.ratio ?? '40:60'
  const bpmUnit = EN_FORM_FIXTURE.bpmUnit

  if (props.mode === 'lead-in') {
    return render(
      <SessionReadout
        mode="lead-in"
        frame={frame}
        strings={strings}
        bpm={bpm}
        ratio={ratio}
        bpmUnit={bpmUnit}
      />,
    )
  }

  return render(
    <SessionReadout
      mode="session"
      frame={frame}
      status={props.status ?? 'idle'}
      showCompletionHeadline={props.showCompletionHeadline ?? false}
      strings={strings}
      bpm={bpm}
      ratio={ratio}
      bpmUnit={bpmUnit}
    />,
  )
}

describe('SessionReadout', () => {
  it('lead-in mode renders the time as primary and the pace as secondary', () => {
    renderReadout({ mode: 'lead-in', frame: sampleFrame })
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · 40:60`)).toBeInTheDocument()
  })

  it('lead-in mode does not show the completion headline (owned by session mode)', () => {
    renderReadout({ mode: 'lead-in', frame: sampleFrame })
    expect(screen.queryByText(EN_STRINGS_FIXTURE.practice.readout.sessionComplete)).not.toBeInTheDocument()
  })

  it('session mode with showCompletionHeadline renders the headline and hides the time', () => {
    renderReadout({
      frame: sampleFrame,
      status: 'complete',
      showCompletionHeadline: true,
    })
    expect(screen.getByText(EN_STRINGS_FIXTURE.practice.readout.sessionComplete)).toBeInTheDocument()
    expect(screen.queryByText('10:00')).not.toBeInTheDocument()
  })

  it('session mode with status "idle", null frame, and no completion headline returns null', () => {
    const { container } = renderReadout({ status: 'idle', frame: null })
    expect(container.firstChild).toBeNull()
  })
})

describe('SessionReadout — secondary content', () => {
  it('HRV frame (no currentBpm) renders "{bpm} BPM · {ratio}" in the secondary', () => {
    renderReadout({ frame: sampleFrame, status: 'running', bpm: 5.5, ratio: '40:60' })
    expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · 40:60`)).toBeInTheDocument()
  })

  it('rounds a free-set HRV bpm in the secondary (no raw float)', () => {
    renderReadout({ frame: sampleFrame, status: 'running', bpm: 1.28862596079109, ratio: '40:60' })
    expect(screen.getByText(`1.29 ${EN_FORM_FIXTURE.bpmUnit} · 40:60`)).toBeInTheDocument()
  })

  it('rounds work frame counts down the round and folds "Round X of N" into the secondary', () => {
    const roundsFrame: SessionFrame = {
      ...sampleFrame,
      remainingSec: 183,
      roundPhase: 'work',
      roundNumber: 1,
      roundsTotal: 2,
      workRemainingSec: 60,
    }
    renderReadout({ frame: roundsFrame, status: 'running', bpm: 5.5, ratio: '40:60' })
    expect(screen.getByText('1:00')).toBeInTheDocument() // per-round, not 3:03 (practice)
    expect(screen.queryByText('3:03')).not.toBeInTheDocument()
    expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · 40:60 · Round 1 of 2`)).toBeInTheDocument()
  })

  it('stretch frame renders live currentBpm + stage in the secondary', () => {
    renderReadout({ frame: stretchFrame, status: 'running' })
    expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · Stretch`)).toBeInTheDocument()
  })

  it('maps each stretch stage to its localized label in the secondary', () => {
    const cases: { stage: NonNullable<SessionFrame['stage']>; label: string }[] = [
      { stage: 'hold-initial', label: 'Warm-up' },
      { stage: 'ramp', label: 'Stretch' },
      { stage: 'hold-target', label: 'Settle' },
    ]
    for (const { stage, label } of cases) {
      const { unmount } = renderReadout({ frame: { ...stretchFrame, stage }, status: 'running' })
      expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · ${label}`)).toBeInTheDocument()
      unmount()
    }
  })

  it('a completed session renders only the headline, no time / secondary content', () => {
    renderReadout({ frame: stretchFrame, status: 'complete', showCompletionHeadline: true })
    expect(screen.queryByText('10:00')).not.toBeInTheDocument()
    expect(screen.queryByText(/5\.5/)).not.toBeInTheDocument()
  })

  it('the lead-in placeholder previews the stretch readout for a stretch frame', () => {
    renderReadout({ mode: 'lead-in', frame: stretchFrame })
    expect(screen.getByText(`5.5 ${EN_FORM_FIXTURE.bpmUnit} · Stretch`)).toBeInTheDocument()
  })
})
