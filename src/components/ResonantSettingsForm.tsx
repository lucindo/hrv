import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  BPM_OPTIONS,
  DURATION_OPTIONS,
  RATIO_INHALE_PRESETS,
  formatRatio,
  getNextDurationOption,
  type DurationOption,
  type SessionSettings,
} from '../domain'
import { SettingsFormShell } from './SettingsFormShell'
import { SettingsSegmentedRow } from './SettingsSegmentedRow'
import { SettingsStepper } from './SettingsStepper'

export interface ResonantSettingsFormProps {
  settings: SessionSettings
  isRunning: boolean
  onChange(this: void, settings: SessionSettings): void
  onExtendDuration(this: void, durationMinutes: number): void
  strings: UiStrings['practice']['settingsForm']
}

export function ResonantSettingsForm({
  settings,
  isRunning,
  onChange,
  onExtendDuration,
  strings,
}: ResonantSettingsFormProps): ReactElement {
  const formatBpm = (value: number): string => `${String(value)} ${strings.bpmUnit}`
  const formatDuration = (value: DurationOption): string =>
    value === 'open-ended' ? strings.openEndedLabel : `${String(value)} ${strings.minutesUnit}`

  const updateSettings = (nextSettings: Partial<SessionSettings>): void => {
    onChange({ ...settings, ...nextSettings })
  }

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

  return (
    <SettingsFormShell ariaLabel={strings.ariaLabel}>
      {!isRunning && (
        <>
          <SettingsStepper
            label={strings.bpmLabel}
            value={settings.bpm}
            options={BPM_OPTIONS}
            formatValue={formatBpm}
            onChange={(bpm) => { updateSettings({ bpm }) }}
            strings={strings.stepper}
          />
          <SettingsSegmentedRow<number>
            label={strings.ratioLabel}
            ariaLabel={strings.stepper.fieldAriaLabel(strings.ratioLabel)}
            value={settings.inhaleShare}
            options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
            onChange={(inhaleShare) => { updateSettings({ inhaleShare }) }}
          />
        </>
      )}
      <SettingsStepper<DurationOption>
        label={strings.durationLabel}
        value={settings.durationMinutes}
        options={DURATION_OPTIONS}
        formatValue={formatDuration}
        onChange={updateDuration}
        disableDecrease={isRunning}
        disableIncrease={isRunning && typeof nextDuration !== 'number'}
        strings={strings.stepper}
      />
    </SettingsFormShell>
  )
}
