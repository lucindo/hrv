import { useEffect, useRef, useState, type ReactElement } from 'react'

import { ChevronBackIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconButton } from '../../components/primitives/IconButton'
import { PageShell } from '../../components/primitives/PageShell'
import { SectionCard } from '../../components/primitives/SectionCard'
import { SettingsSectionHeader } from '../../components/SettingsSectionHeader'
import { TopAppBar } from '../../components/primitives/TopAppBar'
import type { PracticeStatsMap } from '../appViewModel'
import type { UiStrings } from '../../content/strings'
import type { LocaleId } from '../../domain'
import type { PersistedStats, PracticeId } from '../../storage'

// Practices are listed in switcher order: HRV → Stretch → Navi Kriya.
const PRACTICE_ORDER: readonly PracticeId[] = ['resonant', 'stretch', 'naviKriya']

export interface StatsPageProps {
  strings: UiStrings['stats']
  practiceNames: Readonly<Record<PracticeId, string>>
  stats: PracticeStatsMap
  locale: LocaleId
  onResetPracticeStats(this: void, practice: PracticeId): void
  onBack(this: void): void
}

// Human-readable total practice time. Past 72h it switches to an approximate
// "days" form (with exact hours kept in parentheses, localized via formatDays)
// so a heavy user's lifetime total doesn't grow into an unwieldy hour count.
function formatTotalTime(
  totalSeconds: number,
  formatDays: (days: number, hours: number) => string,
): string {
  if (totalSeconds < 60) return `${String(totalSeconds)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours >= 72) return formatDays(Math.round(hours / 24), hours)
  if (hours > 0) {
    const remMinutes = minutes % 60
    return remMinutes > 0 ? `${String(hours)}h ${String(remMinutes)}m` : `${String(hours)}h`
  }
  return `${String(minutes)}m`
}

function formatLastSession(ms: number | null, locale: LocaleId, empty: string): string {
  if (ms === null) return empty
  return new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

function StatRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: 'var(--color-breathing-text-soft)', fontSize: 13 }}>{label}</span>
      <span
        style={{
          color: 'var(--color-breathing-text)',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function PracticeStatsBlock({
  name,
  practice,
  stat,
  strings,
  locale,
  onReset,
}: {
  name: string
  practice: PracticeId
  stat: PersistedStats
  strings: UiStrings['stats']
  locale: LocaleId
  onReset(this: void, practice: PracticeId): void
}): ReactElement {
  const { fields, empty } = strings
  return (
    <>
      <SettingsSectionHeader label={name} />
      <SectionCard padding="14px 16px">
        <div className="grid gap-2">
          {/* Resonant counts rounds (1 session == 1 round), so its row reads "Rounds". */}
          <StatRow
            label={practice === 'resonant' ? fields.rounds : fields.sessions}
            value={String(stat.totalSessions)}
          />
          <StatRow
            label={fields.totalTime}
            value={formatTotalTime(stat.totalElapsedSeconds, strings.totalTimeDays)}
          />
          <StatRow
            label={fields.lastSession}
            value={formatLastSession(stat.lastSessionAtMs, locale, empty)}
          />
          {practice === 'naviKriya' && (
            <StatRow label={fields.rounds} value={String(stat.roundsCompleted ?? 0)} />
          )}
          <div
            className="flex justify-end pt-3"
            style={{ borderTop: '1px solid var(--color-border-soft)', marginTop: 4 }}
          >
            <button
              type="button"
              onClick={() => { onReset(practice) }}
              className="rounded-full bg-[var(--color-breathing-accent)] px-5 py-2 text-xs font-semibold text-[var(--color-breathing-on-accent)] transition hover:bg-[var(--color-breathing-accent-strong)] active:bg-[var(--color-breathing-accent-strong)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-breathing-accent focus-visible:ring-offset-2"
            >
              {strings.reset}
            </button>
          </div>
        </div>
      </SectionCard>
    </>
  )
}

/** Full-page Stats surface — a sibling sub-page of App Settings. One card per
 *  practice with a reset, plus a privacy note. Reachable only when no session is
 *  active (gated by controlsDisabled at the navigation layer). */
export function StatsPage({
  strings,
  practiceNames,
  stats,
  locale,
  onResetPracticeStats,
  onBack,
}: StatsPageProps): ReactElement {
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingReset, setPendingReset] = useState<PracticeId | null>(null)

  useEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true })
  }, [])

  const confirmReset = (): void => {
    if (pendingReset !== null) onResetPracticeStats(pendingReset)
    setPendingReset(null)
  }

  return (
    <PageShell
      overlays={
        <ConfirmDialog
          open={pendingReset !== null}
          onConfirm={confirmReset}
          onCancel={() => { setPendingReset(null) }}
          title={strings.resetConfirm.title(pendingReset !== null ? practiceNames[pendingReset] : '')}
          confirmLabel={strings.resetConfirm.confirm}
          cancelLabel={strings.resetConfirm.cancel}
          body={strings.resetConfirm.body}
        />
      }
    >
      <TopAppBar
        title={strings.title}
        leading={
          <IconButton
            icon={<ChevronBackIcon />}
            label={strings.back}
            onClick={onBack}
            buttonRef={backButtonRef}
          />
        }
      />
      <div className="w-full text-left">
        {PRACTICE_ORDER.map((practice) => (
          <PracticeStatsBlock
            key={practice}
            name={practiceNames[practice]}
            practice={practice}
            stat={stats[practice]}
            strings={strings}
            locale={locale}
            onReset={setPendingReset}
          />
        ))}
        <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-breathing-muted)]">
          {strings.privacyNote}
        </p>
      </div>
    </PageShell>
  )
}
