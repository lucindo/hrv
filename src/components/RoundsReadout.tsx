import type { ReactElement } from 'react'

import { formatDuration } from '../domain'
import type { UiStrings } from '../content/strings'
import { FeedbackTime } from './FeedbackTime'

// Rounds adornment for the breathing surface: a "Round X of N" caption shown
// throughout a rounds session, plus a big MM:SS rest countdown during the rest
// gap between rounds (reusing FeedbackTime). During work the SessionReadout still
// renders the remaining-time number alongside this caption; during rest there is
// no SessionReadout — this is the live readout.

export interface RoundsReadoutProps {
  roundNumber: number
  roundsTotal: number
  phase: 'work' | 'rest' | 'lead-in'
  restRemainingSec: number
  strings: UiStrings['practice']['readout']
}

export function RoundsReadout({
  roundNumber,
  roundsTotal,
  phase,
  restRemainingSec,
  strings,
}: RoundsReadoutProps): ReactElement {
  return (
    <div className="flex w-full flex-col items-center">
      <span
        className="uppercase"
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.16em',
          color: 'var(--color-breathing-muted)',
        }}
      >
        {strings.roundOf(roundNumber, roundsTotal)}
      </span>
      {phase === 'rest' && (
        <FeedbackTime
          primary={formatDuration(restRemainingSec)}
          secondary={strings.rest}
          ariaLabel={strings.announcementAriaLabel}
        />
      )}
    </div>
  )
}
