import type { ReactElement } from 'react'

import { formatDuration } from '../domain'
import type { UiStrings } from '../content/strings'
import { FeedbackTime } from './FeedbackTime'

// Rest adornment for the breathing surface: the big MM:SS rest countdown shown
// during the gap between rounds (reusing FeedbackTime). The "Round X of N"
// caption lives on the work readout's secondary line — not here — so the rest
// screen matches the work readout's height (no layout shift on the transition).

export interface RoundsReadoutProps {
  restRemainingSec: number
  strings: UiStrings['practice']['readout']
}

export function RoundsReadout({ restRemainingSec, strings }: RoundsReadoutProps): ReactElement {
  return (
    <FeedbackTime
      primary={formatDuration(restRemainingSec)}
      secondary={strings.rest}
      ariaLabel={strings.announcementAriaLabel}
    />
  )
}
