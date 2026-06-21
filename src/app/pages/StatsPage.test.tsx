import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StatsPage } from './StatsPage'
import type { PracticeStatsMap } from '../appViewModel'
import { UI_STRINGS } from '../../content/strings'

const STRINGS = UI_STRINGS.en.stats

const PRACTICE_NAMES = { resonant: 'HRV', stretch: 'Stretch', naviKriya: 'Navi' } as const

const STATS: PracticeStatsMap = {
  resonant: {
    totalSessions: 3,
    totalElapsedSeconds: 3600,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 120,
  },
  stretch: {
    totalSessions: 0,
    totalElapsedSeconds: 0,
    lastSessionAtMs: null,
    lastSessionDurationSeconds: null,
  },
  naviKriya: {
    totalSessions: 5,
    totalElapsedSeconds: 600,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 90,
    roundsCompleted: 12,
  },
}

async function clickFirstReset(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // First Reset button is the HRV (resonant) block.
  const [firstReset] = screen.getAllByRole('button', { name: STRINGS.reset })
  if (!firstReset) throw new Error('no reset button rendered')
  await user.click(firstReset)
}

function renderPage(overrides: Partial<{ onResetPracticeStats: () => void; onBack: () => void }> = {}) {
  const onResetPracticeStats = vi.fn()
  const onBack = vi.fn()
  render(
    <StatsPage
      strings={STRINGS}
      practiceNames={PRACTICE_NAMES}
      stats={STATS}
      locale="en"
      onResetPracticeStats={overrides.onResetPracticeStats ?? onResetPracticeStats}
      onBack={overrides.onBack ?? onBack}
    />,
  )
  return { onResetPracticeStats, onBack }
}

describe('StatsPage', () => {
  it('renders one block per practice', () => {
    renderPage()
    expect(screen.getByText('HRV')).toBeInTheDocument()
    expect(screen.getByText('Stretch')).toBeInTheDocument()
    expect(screen.getByText('Navi')).toBeInTheDocument()
  })

  it('labels HRV by rounds and shows the roundsCompleted field for Navi Kriya', () => {
    renderPage()
    // "Rounds" now labels two rows: the resonant count (1 session == 1 round) and
    // Navi's roundsCompleted field. Stretch + Navi keep the "Sessions" label.
    expect(screen.getAllByText(STRINGS.fields.rounds)).toHaveLength(2)
    expect(screen.getAllByText(STRINGS.fields.sessions)).toHaveLength(2)
    expect(screen.getByText('12')).toBeInTheDocument()  // Navi roundsCompleted
  })

  it('renders "—" for a practice with no sessions yet', () => {
    renderPage()
    // Stretch has a null last-session → one em-dash.
    expect(screen.getAllByText(STRINGS.empty).length).toBeGreaterThanOrEqual(1)
  })

  it('formats total time without a trailing 0m (1h, not 1h 0m)', () => {
    renderPage()
    // resonant fixture: 3600s = exactly 1h.
    expect(screen.getByText('1h')).toBeInTheDocument()
    expect(screen.queryByText('1h 0m')).not.toBeInTheDocument()
  })

  it('switches to an approximate days form past 72h', () => {
    const onResetPracticeStats = vi.fn()
    render(
      <StatsPage
        strings={STRINGS}
        practiceNames={PRACTICE_NAMES}
        stats={{
          ...STATS,
          resonant: { ...STATS.resonant, totalElapsedSeconds: 365 * 3600 },
        }}
        locale="en"
        onResetPracticeStats={onResetPracticeStats}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('≈15 days (365h)')).toBeInTheDocument()
  })

  it('renders the privacy note', () => {
    renderPage()
    expect(screen.getByText(STRINGS.privacyNote)).toBeInTheDocument()
  })

  it('reset → confirm modal → confirming calls onResetPracticeStats with that practice', async () => {
    const user = userEvent.setup()
    const { onResetPracticeStats } = renderPage()

    await clickFirstReset(user)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(STRINGS.resetConfirm.title('HRV'))).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: STRINGS.resetConfirm.confirm }))
    expect(onResetPracticeStats).toHaveBeenCalledTimes(1)
    expect(onResetPracticeStats).toHaveBeenCalledWith('resonant')
  })

  it('reset → cancel does not reset', async () => {
    const user = userEvent.setup()
    const { onResetPracticeStats } = renderPage()

    await clickFirstReset(user)
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: STRINGS.resetConfirm.cancel }))
    expect(onResetPracticeStats).not.toHaveBeenCalled()
  })

  it('back button invokes onBack', async () => {
    const user = userEvent.setup()
    const { onBack } = renderPage()
    await user.click(screen.getByRole('button', { name: STRINGS.back }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
