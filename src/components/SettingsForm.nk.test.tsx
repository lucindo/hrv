import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NaviKriyaSettingsForm } from './NaviKriyaSettingsForm'
import { UI_STRINGS } from '../content/strings'
import {
  DEFAULT_NK_SETTINGS,
  NK_FRONT_COUNT_OPTIONS,
  NK_OM_SECONDS,
  estimateNaviKriyaDurationMinutes,
  type NaviKriyaSettings,
} from '../domain'

const EN = UI_STRINGS.en.practice.settingsForm
const NK = UI_STRINGS.en.practice.nkControls

// Stateful harness — the duration estimate and stepper values are derived from
// the nkSettings prop, so changes must flow through a real state holder for the
// "updates live" assertions to mean anything.
function NKHarness({
  initial = DEFAULT_NK_SETTINGS,
  onChangeSpy,
}: {
  initial?: NaviKriyaSettings
  onChangeSpy?: (settings: NaviKriyaSettings) => void
}) {
  const [nk, setNk] = useState<NaviKriyaSettings>(initial)
  return (
    <NaviKriyaSettingsForm
      strings={EN}
      settings={nk}
      onChange={(next) => {
        onChangeSpy?.(next)
        setNk(next)
      }}
      nkControlsStrings={NK}
    />
  )
}

describe('NaviKriyaSettingsForm', () => {
  it('renders the five NK controls with labels from strings.nkControls', () => {
    render(<NKHarness />)
    expect(screen.getByRole('group', { name: NK.roundsLabel })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: NK.frontCountLabel })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: NK.omLengthLabel })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: NK.perOmCueLabel })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: NK.distinctFinalTickLabel })).toBeInTheDocument()
  })

  it('changing the rounds stepper calls onNKSettingsChange with the updated rounds', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, rounds: 3 }} onChangeSpy={onChangeSpy} />)
    await user.click(screen.getByRole('button', { name: EN.stepper.increaseLabel(NK.roundsLabel) }))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    expect((onChangeSpy.mock.calls[0]?.[0] as NaviKriyaSettings).rounds).toBe(4)
  })

  it('every front-count option is a multiple of 4 (T-31-11)', () => {
    expect(NK_FRONT_COUNT_OPTIONS.length).toBeGreaterThan(0)
    for (const option of NK_FRONT_COUNT_OPTIONS) {
      expect(option % 4).toBe(0)
    }
  })

  it('changing the front-count stepper calls back with a multiple-of-4 frontCount', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, frontCount: 100 }} onChangeSpy={onChangeSpy} />)
    await user.click(screen.getByRole('button', { name: EN.stepper.increaseLabel(NK.frontCountLabel) }))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    const next = onChangeSpy.mock.calls[0]?.[0] as NaviKriyaSettings
    expect(next.frontCount % 4).toBe(0)
  })

  it('the OM-length control offers fast/medium/slow and calls back with the chosen omSeconds', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, omSeconds: NK_OM_SECONDS.medium }} onChangeSpy={onChangeSpy} />)
    // J16: OM pace is now a segmented control (radio buttons) inside the
    // SettingsSegmentedRow fieldset, not a +/- stepper.
    const omGroup = screen.getByRole('group', { name: NK.omLengthLabel })
    expect(within(omGroup).getByRole('radio', { name: NK.omLengthMedium })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(omGroup).getByRole('radio', { name: NK.omLengthFast }))
    expect((onChangeSpy.mock.calls[0]?.[0] as NaviKriyaSettings).omSeconds).toBe(NK_OM_SECONDS.fast)
  })

  it('toggling the per-OM cue calls onNKSettingsChange with the flipped perOmCue', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, perOmCue: true }} onChangeSpy={onChangeSpy} />)
    await user.click(screen.getByRole('switch', { name: NK.perOmCueLabel }))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    expect((onChangeSpy.mock.calls[0]?.[0] as NaviKriyaSettings).perOmCue).toBe(false)
  })

  it('toggling the distinct-last-tick cue calls back with the flipped distinctFinalTick', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, perOmCue: true, distinctFinalTick: false }} onChangeSpy={onChangeSpy} />)
    await user.click(screen.getByRole('switch', { name: NK.distinctFinalTickLabel }))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    expect((onChangeSpy.mock.calls[0]?.[0] as NaviKriyaSettings).distinctFinalTick).toBe(true)
  })

  it('the distinct-last-tick toggle is disabled when the per-OM cue is off', () => {
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, perOmCue: false }} />)
    expect(screen.getByRole('switch', { name: NK.distinctFinalTickLabel })).toBeDisabled()
  })

  it('the distinct-last-tick toggle is enabled when the per-OM cue is on', () => {
    render(<NKHarness initial={{ ...DEFAULT_NK_SETTINGS, perOmCue: true }} />)
    expect(screen.getByRole('switch', { name: NK.distinctFinalTickLabel })).toBeEnabled()
  })

  it('D-14: the estimated-duration line has aria-live="polite" and updates live with rounds', async () => {
    const user = userEvent.setup()
    const settings3 = { ...DEFAULT_NK_SETTINGS, rounds: 3 }
    render(<NKHarness initial={settings3} />)
    const line = screen.getByText(NK.estimatedDuration(estimateNaviKriyaDurationMinutes(settings3)))
    expect(line).toHaveAttribute('aria-live', 'polite')
    await user.click(screen.getByRole('button', { name: EN.stepper.increaseLabel(NK.roundsLabel) }))
    expect(
      screen.getByText(NK.estimatedDuration(estimateNaviKriyaDurationMinutes({ ...settings3, rounds: 4 }))),
    ).toBeInTheDocument()
  })

  it('WR-04: the NK controls render enabled (the form is unmounted mid-session, so there is no in-session disabled state)', () => {
    render(<NKHarness />)
    expect(screen.getByRole('button', { name: EN.stepper.increaseLabel(NK.roundsLabel) })).toBeEnabled()
    expect(screen.getByRole('button', { name: EN.stepper.increaseLabel(NK.frontCountLabel) })).toBeEnabled()
    // OM pace is a segmented control after J16 — assert a radio is enabled.
    expect(within(screen.getByRole('group', { name: NK.omLengthLabel })).getByRole('radio', { name: NK.omLengthFast })).toBeEnabled()
    // The per-OM tick toggle is stale-closure-safe and must remain live.
    expect(screen.getByRole('switch', { name: NK.perOmCueLabel })).toBeEnabled()
  })
})
