import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RoundsReadout } from './RoundsReadout'
import { UI_STRINGS } from '../content/strings'

const strings = UI_STRINGS.en.practice.readout

describe('RoundsReadout', () => {
  it('shows the round caption during work, with no rest countdown', () => {
    render(<RoundsReadout roundNumber={1} roundsTotal={3} phase="work" restRemainingSec={0} strings={strings} />)
    expect(screen.getByText('Round 1 of 3')).toBeInTheDocument()
    expect(screen.queryByText(strings.rest)).not.toBeInTheDocument()
  })

  it('shows the rest countdown (MM:SS) during rest', () => {
    render(<RoundsReadout roundNumber={2} roundsTotal={3} phase="rest" restRemainingSec={95} strings={strings} />)
    expect(screen.getByText('Round 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('1:35')).toBeInTheDocument()      // 95 s → 1:35
    expect(screen.getByText(strings.rest)).toBeInTheDocument()
  })
})
