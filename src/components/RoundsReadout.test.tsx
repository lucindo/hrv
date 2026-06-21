import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RoundsReadout } from './RoundsReadout'
import { UI_STRINGS } from '../content/strings'

const strings = UI_STRINGS.en.practice.readout

describe('RoundsReadout', () => {
  it('shows the rest countdown (MM:SS) and the rest label', () => {
    render(<RoundsReadout restRemainingSec={95} strings={strings} />)
    expect(screen.getByText('1:35')).toBeInTheDocument() // 95 s → 1:35
    expect(screen.getByText(strings.rest)).toBeInTheDocument()
  })

  it('does not render the round caption (it lives on the work readout)', () => {
    render(<RoundsReadout restRemainingSec={60} strings={strings} />)
    expect(screen.queryByText(/of/i)).not.toBeInTheDocument()
  })
})
