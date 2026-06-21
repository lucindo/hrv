import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import { OrbShape } from '../components/OrbShape'
import { RoundsReadout } from '../components/RoundsReadout'
import { SessionReadout } from '../components/SessionReadout'
import type { BreathingShapeVariant, OrbIdleBehavior, RingCueStyle } from '../featureFlags'
import type { BreathingPresentation } from './sessionPresentation'

export interface BreathingSessionSurfaceProps {
  presentation: BreathingPresentation
  breathingStrings: UiStrings['practice']['breathing']
  readoutStrings: UiStrings['practice']['readout']
  bpmUnit: string
  variant: BreathingShapeVariant
  idleMode: OrbIdleBehavior
  ringCue: RingCueStyle
}

export function BreathingSessionSurface({
  presentation,
  breathingStrings,
  readoutStrings,
  bpmUnit,
  variant,
  idleMode,
  ringCue,
}: BreathingSessionSurfaceProps): ReactElement {
  const rounds = presentation.readout.rounds

  return (
    <>
      <OrbShape
        cue={presentation.shape.cue}
        frame={presentation.shape.frame}
        leadInDigit={presentation.shape.leadInDigit}
        strings={breathingStrings}
        variant={variant}
        idleMode={idleMode}
        ringCue={ringCue}
        showCompletion={presentation.readout.showCompletionHeadline}
      />
      {rounds !== null && (
        <RoundsReadout
          roundNumber={rounds.roundNumber}
          roundsTotal={rounds.roundsTotal}
          phase={rounds.phase}
          restRemainingSec={rounds.restRemainingSec}
          strings={readoutStrings}
        />
      )}
      {presentation.readout.isLeadInPlaceholder ? (
        <SessionReadout
          mode="lead-in"
          frame={presentation.readout.frame}
          strings={readoutStrings}
          bpm={presentation.readout.bpm}
          ratio={presentation.readout.ratio}
          bpmUnit={bpmUnit}
        />
      ) : rounds === null || rounds.phase === 'work' ? (
        // Work + non-rounds keep the remaining-time readout; rest/lead-in show only
        // the RoundsReadout above (the orb carries the 3-2-1 during lead-in).
        <SessionReadout
          mode="session"
          frame={presentation.readout.frame}
          status={presentation.readout.status}
          showCompletionHeadline={presentation.readout.showCompletionHeadline}
          strings={readoutStrings}
          bpm={presentation.readout.bpm}
          ratio={presentation.readout.ratio}
          bpmUnit={bpmUnit}
        />
      ) : null}
    </>
  )
}
