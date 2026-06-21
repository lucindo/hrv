import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  BPM_MAX,
  BPM_MIN,
  BPM_OPTIONS,
  DEFAULT_SETTINGS,
  DURATION_OPTIONS,
  INHALE_MAX,
  INHALE_MIN,
  RATIO_INHALE_PRESETS,
  RESONANT_ROUNDS_OPTIONS,
  REST_MINUTES_OPTIONS,
  ROUNDS_ON_DEFAULT,
  formatRatio,
  formatTrimmed,
  getNextDurationOption,
  snapSessionSettingsToPresets,
  type DurationOption,
  type SessionSettings,
} from '../domain'
import { useSnapToPresets } from '../hooks/useSnapToPresets'
import { SettingsFormShell } from './SettingsFormShell'
import { SettingsSegmentedRow } from './SettingsSegmentedRow'
import { SettingsSlider } from './SettingsSlider'
import { SettingsStepper } from './SettingsStepper'
import { SettingsToggleRow } from './SettingsToggleRow'

export interface ResonantSettingsFormProps {
  settings: SessionSettings
  isRunning: boolean
  /** When true, the BPM and ratio controls become continuous sliders (precise control). */
  advanced?: boolean
  onChange(this: void, settings: SessionSettings): void
  onExtendDuration(this: void, durationMinutes: number): void
  strings: UiStrings['practice']['settingsForm']
}

export function ResonantSettingsForm({
  settings,
  isRunning,
  advanced = false,
  onChange,
  onExtendDuration,
  strings,
}: ResonantSettingsFormProps): ReactElement {
  const formatBpm = (value: number): string => `${formatTrimmed(value)} ${strings.bpmUnit}`
  const formatDuration = (value: DurationOption): string =>
    value === 'open-ended' ? strings.openEndedLabel : `${String(value)} ${strings.minutesUnit}`
  const formatMinutes = (value: number): string => `${String(value)} ${strings.minutesUnit}`

  useSnapToPresets(advanced, settings, snapSessionSettingsToPresets, onChange)

  const updateSettings = (nextSettings: Partial<SessionSettings>): void => {
    onChange({ ...settings, ...nextSettings })
  }

  const roundsOn = settings.rounds > 1

  const onToggleRounds = (next: boolean): void => {
    if (next) {
      // Rounds need a finite per-round duration — snap an open-ended pick to the default.
      const durationMinutes = settings.durationMinutes === 'open-ended'
        ? DEFAULT_SETTINGS.durationMinutes
        : settings.durationMinutes
      updateSettings({ rounds: ROUNDS_ON_DEFAULT, durationMinutes })
    } else {
      updateSettings({ rounds: 1 })
    }
  }

  // Open-ended is unavailable in rounds mode (a round that never completes can't advance).
  const durationOptions: readonly DurationOption[] = roundsOn
    ? DURATION_OPTIONS.filter((o) => o !== 'open-ended')
    : DURATION_OPTIONS

  const updateDuration = (durationMinutes: DurationOption): void => {
    if (isRunning) {
      if (typeof durationMinutes === 'number') {
        onExtendDuration(durationMinutes)
      }
      return
    }

    updateSettings({ durationMinutes })
  }

  const nextDuration = getNextDurationOption(settings.durationMinutes)

  // Rounds mode guarantees a finite per-round duration (toggle snaps open-ended away).
  const roundsTotalMinutes =
    roundsOn && typeof settings.durationMinutes === 'number'
      ? settings.rounds * settings.durationMinutes + (settings.rounds - 1) * settings.restMinutes
      : 0

  return (
    <SettingsFormShell ariaLabel={strings.ariaLabel}>
      {!isRunning && (
        <>
          {advanced ? (
            <SettingsSlider
              label={strings.bpmLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.bpmLabel)}
              value={settings.bpm}
              min={BPM_MIN}
              max={BPM_MAX}
              nudge={0.05}
              formatValue={formatBpm}
              onChange={(bpm) => { updateSettings({ bpm }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsStepper
              label={strings.bpmLabel}
              value={settings.bpm}
              options={BPM_OPTIONS}
              formatValue={formatBpm}
              onChange={(bpm) => { updateSettings({ bpm }) }}
              strings={strings.stepper}
            />
          )}
          {advanced ? (
            <SettingsSlider
              label={strings.ratioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.ratioLabel)}
              value={settings.inhaleShare}
              min={INHALE_MIN}
              max={INHALE_MAX}
              nudge={1}
              formatValue={formatRatio}
              onChange={(inhaleShare) => { updateSettings({ inhaleShare }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsSegmentedRow<number>
              label={strings.ratioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.ratioLabel)}
              value={settings.inhaleShare}
              options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
              onChange={(inhaleShare) => { updateSettings({ inhaleShare }) }}
            />
          )}
        </>
      )}
      <SettingsStepper<DurationOption>
        label={strings.durationLabel}
        value={settings.durationMinutes}
        options={durationOptions}
        formatValue={formatDuration}
        onChange={updateDuration}
        disableDecrease={isRunning}
        disableIncrease={isRunning && typeof nextDuration !== 'number'}
        strings={strings.stepper}
      />
      {!isRunning && (
        <>
          <SettingsToggleRow
            label={strings.roundsToggleLabel}
            ariaLabel={strings.roundsToggleLabel}
            checked={roundsOn}
            onChange={onToggleRounds}
          />
          {/* Count + rest are inert until the toggle is on (disabled steppers). */}
          <SettingsStepper<number>
            label={strings.roundsCountLabel}
            value={roundsOn ? settings.rounds : ROUNDS_ON_DEFAULT}
            options={RESONANT_ROUNDS_OPTIONS}
            onChange={(rounds) => { updateSettings({ rounds }) }}
            disabled={!roundsOn}
            strings={strings.stepper}
          />
          <SettingsStepper<number>
            label={strings.restBetweenLabel}
            value={settings.restMinutes}
            options={REST_MINUTES_OPTIONS}
            formatValue={formatMinutes}
            onChange={(restMinutes) => { updateSettings({ restMinutes }) }}
            disabled={!roundsOn}
            strings={strings.stepper}
          />
          {roundsOn && (
            <p
              aria-live="polite"
              className="mt-3 text-center text-sm text-[var(--color-breathing-muted)]"
            >
              {strings.roundsTotalDuration(roundsTotalMinutes)}
            </p>
          )}
        </>
      )}
    </SettingsFormShell>
  )
}
