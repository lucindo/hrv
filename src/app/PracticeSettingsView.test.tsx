import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { UI_STRINGS } from '../content/strings'
import {
  DEFAULT_NK_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STRETCH_SETTINGS,
  type NaviKriyaSettings,
  type SessionSettings,
  type StretchSettings,
} from '../domain'
import { UiStringsProvider } from '../hooks/useUiStringsContext'
import type { AppPracticeSettingsViewModel } from './appViewModel'
import { PracticeSettingsView } from './PracticeSettingsView'

const EN = UI_STRINGS.en

const noopChange = (): void => {}
const noopExtend = (): void => {}

function makeResonantVM(overrides: {
  settings?: SessionSettings
  isRunning?: boolean
  isComplete?: boolean
} = {}): AppPracticeSettingsViewModel {
  return {
    kind: 'resonant',
    settings: overrides.settings ?? DEFAULT_SETTINGS,
    isRunning: overrides.isRunning ?? false,
    isComplete: overrides.isComplete ?? false,
    onChange: noopChange,
    onExtendDuration: noopExtend,
  }
}

function makeStretchVM(overrides: {
  settings?: StretchSettings
  isRunning?: boolean
  isComplete?: boolean
} = {}): AppPracticeSettingsViewModel {
  return {
    kind: 'stretch',
    settings: overrides.settings ?? DEFAULT_STRETCH_SETTINGS,
    isRunning: overrides.isRunning ?? false,
    isComplete: overrides.isComplete ?? false,
    onChange: noopChange,
  }
}

function makeNaviVM(overrides: {
  settings?: NaviKriyaSettings
  isComplete?: boolean
} = {}): AppPracticeSettingsViewModel {
  return {
    kind: 'naviKriya',
    settings: overrides.settings ?? DEFAULT_NK_SETTINGS,
    isComplete: overrides.isComplete ?? false,
    onChange: noopChange,
  }
}

// Mounts PracticeSettingsView with stateful sheet open/close so we can drive
// the full SetupCard → SettingsSheet → form flow from the test perspective.
function renderView(vm: AppPracticeSettingsViewModel): { rerender: () => void } {
  function Host(): ReactElement {
    const [open, setOpen] = useState(false)
    return (
      <UiStringsProvider value={EN}>
        <PracticeSettingsView
          settings={vm}
          isSheetOpen={open}
          advanced={false}
          onOpenSheet={() => { setOpen(true) }}
          onCloseSheet={() => { setOpen(false) }}
        />
      </UiStringsProvider>
    )
  }
  const utils = render(<Host />)
  return { rerender: () => { utils.rerender(<Host />) } }
}

describe('PracticeSettingsView — resonant (HRV)', () => {
  it('renders the SetupCard with PACE / RATIO / DURATION cells from current settings', () => {
    renderView(makeResonantVM())
    const card = screen.getByRole('button', { name: /^Edit HRV Breathing settings$/ })
    expect(within(card).getByText(EN.practice.settingsForm.bpmLabel)).toBeVisible()
    expect(within(card).getByText(EN.practice.settingsForm.ratioLabel)).toBeVisible()
    expect(within(card).getByText(EN.practice.settingsForm.durationLabel)).toBeVisible()
    expect(within(card).getByText('5.5 BPM')).toBeVisible()
    expect(within(card).getByText('10 min')).toBeVisible()
  })

  it('formats an open-ended duration with the openEndedLabel string', () => {
    renderView(makeResonantVM({
      settings: { ...DEFAULT_SETTINGS, durationMinutes: 'open-ended' },
    }))
    const card = screen.getByRole('button', { name: /^Edit HRV Breathing settings$/ })
    expect(within(card).getByText(EN.practice.settingsForm.openEndedLabel)).toBeVisible()
  })

  it('does not render the form on Idle until the SetupCard is tapped', async () => {
    const user = userEvent.setup()
    renderView(makeResonantVM())
    expect(screen.queryByRole('group', { name: EN.practice.settingsForm.bpmLabel })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Edit HRV Breathing settings$/ }))
    expect(screen.getByRole('group', { name: EN.practice.settingsForm.bpmLabel })).toBeVisible()
  })

  it('renders nothing on Running (congruent with stretch + navi running)', () => {
    // J16: HRV running surfaces no settings UI — SetupCard, sheet, and any
    // inline stepper are all hidden. extendDuration logic stays in the
    // viewmodel + controller but is unwired here.
    renderView(makeResonantVM({ isRunning: true }))
    expect(screen.queryByRole('button', { name: /^Edit HRV Breathing settings$/ })).toBeNull()
    expect(screen.queryByRole('group', { name: EN.practice.settingsForm.durationLabel })).toBeNull()
  })
})

describe('PracticeSettingsView — stretch', () => {
  it('renders 3 summary cells (start, target, duration) on Idle', () => {
    renderView(makeStretchVM())
    const card = screen.getByRole('button', { name: /^Edit HRV Stretch settings$/ })
    for (const label of [
      EN.practice.settingsForm.initialBpmShortLabel,
      EN.practice.settingsForm.targetBpmShortLabel,
      EN.practice.settingsForm.durationLabel,
    ]) {
      expect(within(card).getByText(label)).toBeVisible()
    }
    // The card no longer surfaces ratio/warm-up/ramp/cool-down labels — those
    // live in the SettingsSheet form only.
    for (const label of [
      EN.practice.settingsForm.ratioLabel,
      EN.practice.settingsForm.holdInitialLabel,
      EN.practice.settingsForm.rampDurationLabel,
      EN.practice.settingsForm.holdTargetLabel,
    ]) {
      expect(within(card).queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('renders nothing on Running (no in-session affordance for Stretch)', () => {
    const { container } = render(
      <UiStringsProvider value={EN}>
        <PracticeSettingsView
          settings={makeStretchVM({ isRunning: true })}
          isSheetOpen={false}
          advanced={false}
          onOpenSheet={vi.fn()}
          onCloseSheet={vi.fn()}
        />
      </UiStringsProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PracticeSettingsView — naviKriya', () => {
  it('renders 3 cells (rounds, frontCount, omLength) on Idle', () => {
    renderView(makeNaviVM())
    const card = screen.getByRole('button', { name: /^Edit Navi Kriya settings$/ })
    for (const label of [
      EN.practice.nkControls.roundsLabel,
      EN.practice.nkControls.frontCountShortLabel,
      EN.practice.nkControls.omLengthShortLabel,
    ]) {
      expect(within(card).getByText(label)).toBeVisible()
    }
  })
})

describe('PracticeSettingsView — hidden (navi session active)', () => {
  it('renders nothing when the viewmodel is in the hidden state', () => {
    const { container } = render(
      <UiStringsProvider value={EN}>
        <PracticeSettingsView
          settings={{ kind: 'hidden' }}
          isSheetOpen={false}
          advanced={false}
          onOpenSheet={vi.fn()}
          onCloseSheet={vi.fn()}
        />
      </UiStringsProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PracticeSettingsView — sheet header reuses the switcher heading', () => {
  it('uses "Practice" as the title and the practice heading as the subtitle', async () => {
    const user = userEvent.setup()
    renderView(makeResonantVM())
    await user.click(screen.getByRole('button', { name: /^Edit HRV Breathing settings$/ }))
    const dialog = screen.getByRole('dialog', { name: EN.practice.settingsSheet.title })
    expect(within(dialog).getByRole('heading', { level: 2, name: EN.practice.settingsSheet.title })).toBeVisible()
    expect(within(dialog).getByText(EN.practice.switcher.resonantHeading)).toBeVisible()
  })

  it('the close button uses the localized close label and closes the sheet', async () => {
    const user = userEvent.setup()
    renderView(makeResonantVM())
    await user.click(screen.getByRole('button', { name: /^Edit HRV Breathing settings$/ }))
    expect(screen.getByRole('group', { name: EN.practice.settingsForm.bpmLabel })).toBeVisible()
    await user.click(screen.getByRole('button', { name: EN.practice.settingsSheet.close }))
    expect(screen.queryByRole('group', { name: EN.practice.settingsForm.bpmLabel })).toBeNull()
  })
})
