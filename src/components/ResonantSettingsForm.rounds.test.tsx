import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ResonantSettingsForm } from './ResonantSettingsForm'
import { UI_STRINGS } from '../content/strings'
import { DEFAULT_SETTINGS, type SessionSettings } from '../domain'

const EN = UI_STRINGS.en.practice.settingsForm

function renderForm(settings: SessionSettings) {
  const onChange = vi.fn()
  render(
    <ResonantSettingsForm
      settings={settings}
      isRunning={false}
      onChange={onChange}
      onExtendDuration={vi.fn()}
      strings={EN}
    />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('ResonantSettingsForm — rounds', () => {
  it('defaults to rounds off with count + rest disabled', () => {
    renderForm(DEFAULT_SETTINGS)
    expect(screen.getByRole('switch', { name: 'Rounds' })).not.toBeChecked()
    const count = screen.getByRole('group', { name: 'Number of rounds' })
    expect(within(count).getByRole('button', { name: 'Increase Number of rounds' })).toBeDisabled()
    const rest = screen.getByRole('group', { name: 'Rest between rounds' })
    expect(within(rest).getByRole('button', { name: 'Increase Rest between rounds' })).toBeDisabled()
  })

  it('enabling rounds sets the count to 2 and keeps a finite duration', async () => {
    const { onChange, user } = renderForm(DEFAULT_SETTINGS) // duration 10
    await user.click(screen.getByRole('switch', { name: 'Rounds' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rounds: 2, durationMinutes: 10 }))
  })

  it('enabling rounds on an open-ended duration snaps it to the default', async () => {
    const { onChange, user } = renderForm({ ...DEFAULT_SETTINGS, durationMinutes: 'open-ended' })
    await user.click(screen.getByRole('switch', { name: 'Rounds' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ rounds: 2, durationMinutes: DEFAULT_SETTINGS.durationMinutes }),
    )
  })

  it('disabling rounds snaps the count back to 1', async () => {
    const { onChange, user } = renderForm({ ...DEFAULT_SETTINGS, rounds: 3, durationMinutes: 5 })
    await user.click(screen.getByRole('switch', { name: 'Rounds' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rounds: 1 }))
  })

  it('edits count and rest when rounds is on', async () => {
    const { onChange, user } = renderForm({ ...DEFAULT_SETTINGS, rounds: 2, restMinutes: 5, durationMinutes: 5 })
    const count = screen.getByRole('group', { name: 'Number of rounds' })
    await user.click(within(count).getByRole('button', { name: 'Increase Number of rounds' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rounds: 3 }))

    const rest = screen.getByRole('group', { name: 'Rest between rounds' })
    await user.click(within(rest).getByRole('button', { name: 'Increase Rest between rounds' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ restMinutes: 6 }))
  })
})
