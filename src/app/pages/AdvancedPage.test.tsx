import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UI_STRINGS } from '../../content/strings'
import { UiStringsProvider } from '../../hooks/useUiStringsContext'
import { STATE_KEY } from '../../storage'
import { DEFAULT_PREFS } from '../../storage/prefs'
import { AdvancedPage } from './AdvancedPage'

function renderPage(props: Partial<{ onBack: () => void }> = {}) {
  const onBack = props.onBack ?? vi.fn()
  const utils = render(
    <UiStringsProvider value={UI_STRINGS.en}>
      <AdvancedPage onBack={onBack} />
    </UiStringsProvider>,
  )
  return { ...utils, onBack }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('AdvancedPage', () => {
  it('renders the locked page title Advanced', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: UI_STRINGS.en.advanced.title }),
    ).toBeInTheDocument()
  })

  it('renders a back-chevron with the locked aria-label', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: UI_STRINGS.en.advanced.backChevron }),
    ).toBeInTheDocument()
  })

  it('invokes onBack when back-chevron is clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    renderPage({ onBack })
    await user.click(screen.getByRole('button', { name: UI_STRINGS.en.advanced.backChevron }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders two radiogroups for Orb and Ring cue', () => {
    renderPage()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
  })

  it('renders four switches for Breathing effect, Switcher icons, Bypass silent mode, and Precise control', () => {
    renderPage()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(4)
    expect(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.breathingEffect.label }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.switcherIcons.label }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.bypassSilentMode.label }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.preciseControl.label }),
    ).toBeInTheDocument()
  })

  it('focuses the back-chevron on mount', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: UI_STRINGS.en.advanced.backChevron }),
    ).toHaveFocus()
  })

  it('writes breathingShape to the prefs envelope when an orb option is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      screen.getByRole('radio', { name: UI_STRINGS.en.advanced.orb.options.kuthasta }),
    )
    const raw = window.localStorage.getItem(STATE_KEY)
    expect(raw).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const envelope = JSON.parse(raw!) as { prefs: typeof DEFAULT_PREFS }
    expect(envelope.prefs.breathingShape).toBe('spiritual-eye')
  })

  it('writes orbIdle=ambient to the prefs envelope when Breathing effect is toggled on', async () => {
    // Seed with default prefs so orbIdle starts as 'still'
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ version: 1, prefs: { ...DEFAULT_PREFS, orbIdle: 'still' } }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.breathingEffect.label }),
    )
    const raw = window.localStorage.getItem(STATE_KEY)
    expect(raw).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const envelope = JSON.parse(raw!) as { prefs: typeof DEFAULT_PREFS }
    expect(envelope.prefs.orbIdle).toBe('ambient')
  })

  it('writes switcherIcon=true to the prefs envelope when Switcher icons is toggled on', async () => {
    // Seed with switcherIcon=false
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ version: 1, prefs: { ...DEFAULT_PREFS, switcherIcon: false } }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(
      screen.getByRole('switch', { name: UI_STRINGS.en.advanced.switcherIcons.label }),
    )
    const raw = window.localStorage.getItem(STATE_KEY)
    expect(raw).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const envelope = JSON.parse(raw!) as { prefs: typeof DEFAULT_PREFS }
    expect(envelope.prefs.switcherIcon).toBe(true)
  })

  describe('Phase 49.1 D-03 — Bypass silent mode toggle (ADV-03)', () => {
    it('renders Bypass silent mode toggle below the other two Behavior toggles (ADV-03 order)', () => {
      renderPage()
      const switches = screen.getAllByRole('switch')
      expect(switches).toHaveLength(4)
      // ADV-03: bypass toggle is the THIRD (below breathingEffect + switcherIcons);
      // precise control follows as the fourth.
      // Reason: switches[2] non-null asserted by toHaveLength(4) above.
      expect(switches[2]).toHaveAccessibleName(UI_STRINGS.en.advanced.bypassSilentMode.label)
      expect(switches[3]).toHaveAccessibleName(UI_STRINGS.en.advanced.preciseControl.label)
    })

    it('Bypass silent mode defaults to ON (checked) for a fresh storage state (ADV-03)', () => {
      renderPage()
      expect(
        screen.getByRole('switch', { name: UI_STRINGS.en.advanced.bypassSilentMode.label }),
      ).toBeChecked()
    })

    it('writes bypassSilentMode=false to the prefs envelope when toggled off', async () => {
      // Default is bypassSilentMode=true; toggle OFF writes false.
      const user = userEvent.setup()
      renderPage()
      await user.click(
        screen.getByRole('switch', { name: UI_STRINGS.en.advanced.bypassSilentMode.label }),
      )
      const raw = window.localStorage.getItem(STATE_KEY)
      expect(raw).not.toBeNull()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const envelope = JSON.parse(raw!) as { prefs: typeof DEFAULT_PREFS }
      expect(envelope.prefs.bypassSilentMode).toBe(false)
    })
  })
})
