import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  BPM_MAX,
  BPM_MIN,
  BPM_OPTIONS,
  DURATION_OPTIONS,
  INHALE_MAX,
  INHALE_MIN,
  RATIO_INHALE_PRESETS,
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

  useSnapToPresets(advanced, settings, snapSessionSettingsToPresets, onChange)

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
