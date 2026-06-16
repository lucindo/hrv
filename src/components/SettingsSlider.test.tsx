import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsSlider } from './SettingsSlider'
import { UI_STRINGS } from '../content/strings'

const stepper = UI_STRINGS.en.practice.settingsForm.stepper

function renderSlider(overrides: Partial<Parameters<typeof SettingsSlider>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <SettingsSlider
      label="BPM"
      ariaLabel="BPM"
      value={3.35}
      min={1}
      max={7}
      nudge={0.05}
      formatValue={(v) => v.toFixed(2)}
      onChange={onChange}
      strings={stepper}
      {...overrides}
    />,
  )
  return { onChange }
}

describe('SettingsSlider', () => {
  it('renders the rounded value and exposes it as the slider aria-valuetext', () => {
    renderSlider()
    const slider = screen.getByRole('slider', { name: 'BPM' })
    expect(slider).toHaveValue('3.35')
    expect(slider).toHaveAttribute('aria-valuetext', '3.35')
  })

  it('reports the continuous value on drag', () => {
    const { onChange } = renderSlider()
    fireEvent.change(screen.getByRole('slider', { name: 'BPM' }), { target: { value: '5.5' } })
    expect(onChange).toHaveBeenCalledWith(5.5)
  })

  it('nudges down and up by the nudge delta, on a tidy grid', () => {
    const { onChange } = renderSlider()
    fireEvent.click(screen.getByRole('button', { name: stepper.decreaseLabel('BPM') }))
    expect(onChange).toHaveBeenCalledWith(3.3)
    fireEvent.click(screen.getByRole('button', { name: stepper.increaseLabel('BPM') }))
    expect(onChange).toHaveBeenCalledWith(3.4)
  })

  it('disables the decrease button at the minimum and clamps', () => {
    renderSlider({ value: 1 })
    expect(screen.getByRole('button', { name: stepper.decreaseLabel('BPM') })).toBeDisabled()
    expect(screen.getByRole('button', { name: stepper.increaseLabel('BPM') })).toBeEnabled()
  })

  it('disables the increase button at the maximum', () => {
    renderSlider({ value: 7 })
    expect(screen.getByRole('button', { name: stepper.increaseLabel('BPM') })).toBeDisabled()
    expect(screen.getByRole('button', { name: stepper.decreaseLabel('BPM') })).toBeEnabled()
  })
})
