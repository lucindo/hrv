import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NaviKriyaSettingsForm } from './NaviKriyaSettingsForm'
import { ResonantSettingsForm } from './ResonantSettingsForm'
import { StretchSettingsForm } from './StretchSettingsForm'
import { UI_STRINGS } from '../content/strings'
import {
  DEFAULT_NK_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STRETCH_SETTINGS,
  computeStretchTotalSec,
  type NaviKriyaSettings,
  type SessionSettings,
  type StretchSettings,
} from '../domain'
import type { PracticeId } from '../storage'

const EN = UI_STRINGS.en.practice.settingsForm

interface RenderFormOverrides {
  activePractice?: PracticeId
  settings?: SessionSettings
  isRunning?: boolean
  onChange?: (settings: SessionSettings) => void
  onExtendDuration?: (durationMinutes: number) => void
  strings?: typeof EN
  stretchSettings?: StretchSettings
  onStretchSettingsChange?: (settings: StretchSettings) => void
  nkSettings?: NaviKriyaSettings
  onNKSettingsChange?: (settings: NaviKriyaSettings) => void
}

function renderForm(overrides: RenderFormOverrides = {}) {
  const activePractice = overrides.activePractice ?? 'resonant'
  const onChange = vi.fn()
  const onExtendDuration = vi.fn()
  const onStretchSettingsChange = vi.fn()
  const onNKSettingsChange = vi.fn()

  if (activePractice === 'resonant') {
    render(
      <ResonantSettingsForm
        settings={overrides.settings ?? DEFAULT_SETTINGS}
        isRunning={overrides.isRunning ?? false}
        onChange={overrides.onChange ?? onChange}
        onExtendDuration={overrides.onExtendDuration ?? onExtendDuration}
        strings={overrides.strings ?? EN}
      />,
    )
  } else if (activePractice === 'stretch') {
    render(
      <StretchSettingsForm
        isRunning={overrides.isRunning ?? false}
        strings={overrides.strings ?? EN}
        settings={overrides.stretchSettings ?? DEFAULT_STRETCH_SETTINGS}
        onChange={overrides.onStretchSettingsChange ?? onStretchSettingsChange}
      />,
    )
  } else {
    render(
      <NaviKriyaSettingsForm
        strings={overrides.strings ?? EN}
        settings={overrides.nkSettings ?? DEFAULT_NK_SETTINGS}
        onChange={overrides.onNKSettingsChange ?? onNKSettingsChange}
        nkControlsStrings={UI_STRINGS.en.practice.nkControls}
      />,
    )
  }

  return { onChange, onExtendDuration, onStretchSettingsChange }
}

// Stepper fieldsets expose role="group" named by their legend — query by these
// to avoid text collisions (e.g. "Stretch" is both the practice label and the
// ramp-stage field label).
const STRETCH_GROUPS = ['Start BPM', 'Target BPM', 'Warm-up', 'Stretch', 'Settle']

describe('StretchSettingsForm', () => {
  it('renders the stretch steppers (5 ramp groups)', () => {
    renderForm({ activePractice: 'stretch' })
    for (const group of STRETCH_GROUPS) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    }
  })

  it('does not render the resonant BPM stepper', () => {
    renderForm({ activePractice: 'stretch' })
    expect(screen.queryByRole('group', { name: 'BPM' })).not.toBeInTheDocument()
  })

  it('does not render a session mode switch', () => {
    renderForm({ activePractice: 'stretch' })
    expect(screen.queryByRole('switch', { name: 'Session mode' })).not.toBeInTheDocument()
  })

  it('ResonantSettingsForm renders standard knobs with no stretch steppers', () => {
    renderForm({ activePractice: 'resonant' })
    expect(screen.getByRole('group', { name: 'BPM' })).toBeInTheDocument()
    for (const group of STRETCH_GROUPS) {
      expect(screen.queryByRole('group', { name: group })).not.toBeInTheDocument()
    }
  })

  it('lowering initialBpm auto-corrects a now-invalid targetBpm below the new initialBpm', async () => {
    const user = userEvent.setup()
    const { onStretchSettingsChange } = renderForm({
      activePractice: 'stretch',
      stretchSettings: { ...DEFAULT_STRETCH_SETTINGS, initialBpm: 2, targetBpm: 1.5 },
    })
    await user.click(screen.getByRole('button', { name: EN.stepper.decreaseLabel('Start BPM') }))
    expect(onStretchSettingsChange).toHaveBeenCalledTimes(1)
    const next = onStretchSettingsChange.mock.calls[0]?.[0] as StretchSettings
    expect(next.initialBpm).toBe(1.5)
    expect(next.targetBpm).toBe(1)
    expect(next.targetBpm).toBeLessThan(next.initialBpm)
  })

  it('read-only Duration box shows the computed total for default stretch values', () => {
    renderForm({ activePractice: 'stretch' })
    // CR-01: duration is derived from the snapped segment table, not raw minute sum.
    // DEFAULT_STRETCH_SETTINGS (5.5→4.5 BPM) produces cycle-aligned drift — the
    // displayed value may differ from '15 min' depending on the snapped total.
    // GAP 1: the value is now rounded to the nearest whole minute (Math.round).
    const expectedTotalSec = computeStretchTotalSec(DEFAULT_STRETCH_SETTINGS)
    if (expectedTotalSec === null) throw new Error('Expected finite default stretch duration')
    const expectedText = `${String(Math.round(expectedTotalSec / 60))} min`
    const duration = screen.getByRole('group', { name: 'Duration' })
    expect(within(duration).getByText(expectedText)).toBeInTheDocument()
  })

  it('Duration box shows the open-ended label when cool-down is open-ended', () => {
    renderForm({
      activePractice: 'stretch',
      stretchSettings: { ...DEFAULT_STRETCH_SETTINGS, coolDownMinutes: 'open-ended' },
    })
    const duration = screen.getByRole('group', { name: 'Duration' })
    expect(within(duration).getByText('∞')).toBeInTheDocument()
  })

  // UAT GAP 1: Duration readout shows a rounded whole-minute value (not an unrounded float)
  it('GAP 1: Duration readout shows a rounded whole-minute string, not a fractional float', () => {
    renderForm({ activePractice: 'stretch' })
    // computeStretchTotalSec returns seconds; divide by 60 to convert to minutes.
    const totalSec = computeStretchTotalSec(DEFAULT_STRETCH_SETTINGS)
    if (totalSec === null) throw new Error('Expected finite default stretch duration')
    const roundedMinutes = Math.round(totalSec / 60)
    const duration = screen.getByRole('group', { name: 'Duration' })
    // The text must use the rounded integer, not the raw quotient (which may be a float)
    expect(within(duration).getByText(`${String(roundedMinutes)} min`)).toBeInTheDocument()
    // The unrounded float must NOT appear if it differs from the rounded value.
    // After the GAP-1 fix the realized total is whole-minute exact, so sec/60 is
    // integer-clean for DEFAULT_STRETCH_SETTINGS. The structural assertion below is
    // preserved — it remains correct, but in practice rawFloat === roundedMinutes is the common path.
    const rawFloat = totalSec / 60
    if (rawFloat !== roundedMinutes) {
      expect(within(duration).queryByText(`${String(rawFloat)} min`)).not.toBeInTheDocument()
    }
  })

  // UAT GAP 1: open-ended branch is preserved (the open-ended label is unaffected by the rounding fix)
  it('GAP 1: open-ended cool-down still shows open-ended label (rounding fix does not affect open-ended branch)', () => {
    renderForm({
      activePractice: 'stretch',
      stretchSettings: { ...DEFAULT_STRETCH_SETTINGS, coolDownMinutes: 'open-ended' },
    })
    const duration = screen.getByRole('group', { name: 'Duration' })
    expect(within(duration).getByText('∞')).toBeInTheDocument()
    expect(within(duration).queryByText(/\d+\.\d+ min/)).not.toBeInTheDocument()
  })

  // UAT GAP 2: stretch steppers are hidden when isRunning is true (mirrors resonant behavior)
  it('GAP 2: with isRunning=true, none of the stretch steppers render', () => {
    renderForm({ activePractice: 'stretch', isRunning: true })
    // All ramp groups must be absent during a running session
    for (const group of STRETCH_GROUPS) {
      expect(screen.queryByRole('group', { name: group })).not.toBeInTheDocument()
    }
    // The ratio and Duration groups must also be absent
    expect(screen.queryByRole('group', { name: 'Start Ratio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Target Ratio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Duration' })).not.toBeInTheDocument()
  })

  // UAT GAP 2: stretch steppers are visible when isRunning is false (no regression)
  it('GAP 2: with isRunning=false, all stretch steppers render (no regression)', () => {
    renderForm({ activePractice: 'stretch', isRunning: false })
    for (const group of STRETCH_GROUPS) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    }
    expect(screen.getByRole('group', { name: 'Start Ratio' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Target Ratio' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Duration' })).toBeInTheDocument()
  })

  it('changing start ratio calls onStretchSettingsChange with updated ratio', async () => {
    const user = userEvent.setup()
    const { onStretchSettingsChange } = renderForm({
      activePractice: 'stretch',
      stretchSettings: { ...DEFAULT_STRETCH_SETTINGS, inhaleShare: 40 },
    })
    // Ratio is a segmented control (radio buttons) inside the
    // SettingsSegmentedRow fieldset, not a +/- stepper.
    const ratioGroup = screen.getByRole('group', { name: 'Start Ratio' })
    await user.click(within(ratioGroup).getByRole('radio', { name: '50:50' }))
    expect(onStretchSettingsChange).toHaveBeenCalledTimes(1)
    expect((onStretchSettingsChange.mock.calls[0]?.[0] as StretchSettings).inhaleShare).toBe(50)
  })

  it('changing target ratio calls onStretchSettingsChange with updated targetRatio', async () => {
    const user = userEvent.setup()
    const { onStretchSettingsChange } = renderForm({
      activePractice: 'stretch',
      stretchSettings: { ...DEFAULT_STRETCH_SETTINGS, targetInhaleShare: 40 },
    })
    const targetRatioGroup = screen.getByRole('group', { name: 'Target Ratio' })
    await user.click(within(targetRatioGroup).getByRole('radio', { name: '20:80' }))
    expect(onStretchSettingsChange).toHaveBeenCalledTimes(1)
    expect((onStretchSettingsChange.mock.calls[0]?.[0] as StretchSettings).targetInhaleShare).toBe(20)
  })
})

describe('ResonantSettingsForm', () => {
  it('keeps only duration controls available while running', () => {
    renderForm({ activePractice: 'resonant', isRunning: true })

    expect(screen.queryByRole('group', { name: 'BPM' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Ratio' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Duration' })).toBeInTheDocument()
  })

  it('extends duration through the session callback while running', async () => {
    const user = userEvent.setup()
    const { onChange, onExtendDuration } = renderForm({
      activePractice: 'resonant',
      isRunning: true,
      settings: DEFAULT_SETTINGS,
    })

    await user.click(screen.getByRole('button', { name: /increase duration/i }))

    expect(onExtendDuration).toHaveBeenCalledWith(15)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Practice settings forms stay isolated by practice', () => {
  it('ResonantSettingsForm renders the resonant knobs', () => {
    renderForm({ activePractice: 'resonant' })
    expect(screen.getByRole('group', { name: 'BPM' })).toBeInTheDocument()
  })

  it('NaviKriyaSettingsForm renders no resonant or stretch knobs', () => {
    renderForm({ activePractice: 'naviKriya' })
    // No resonant knobs in the Navi Kriya branch.
    expect(screen.queryByRole('group', { name: 'BPM' })).not.toBeInTheDocument()
    for (const group of STRETCH_GROUPS) {
      expect(screen.queryByRole('group', { name: group })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('switch', { name: 'Session mode' })).not.toBeInTheDocument()
  })

  it('NaviKriyaSettingsForm renders the real NK controls and no inline practice heading', () => {
    renderForm({ activePractice: 'naviKriya' })
    expect(
      screen.getByRole('group', { name: UI_STRINGS.en.practice.nkControls.roundsLabel }),
    ).toBeInTheDocument()
    // The practice is named in the app header/title, not by an inline heading.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
