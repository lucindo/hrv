import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  COOLDOWN_OPTIONS,
  RAMP_DURATION_OPTIONS,
  RATIO_INHALE_PRESETS,
  STRETCH_INITIAL_BPM_OPTIONS,
  WARMUP_MINUTES_OPTIONS,
  computeStretchTotalSec,
  formatRatio,
  getStretchSettingsWithInitialBpm,
  getStretchTargetBpmOptions,
  type CoolDownMinutes,
  type StretchSettings,
  type WarmUpMinutes,
} from '../domain'
import { SettingsFormShell } from './SettingsFormShell'
import { SettingsSegmentedRow } from './SettingsSegmentedRow'
import { SettingsStepper } from './SettingsStepper'

export interface StretchSettingsFormProps {
  isRunning: boolean
  settings: StretchSettings
  onChange(this: void, settings: StretchSettings): void
  strings: UiStrings['practice']['settingsForm']
}

function ignoreReadOnlyDurationChange(): void {}

export function StretchSettingsForm({
  isRunning,
  settings,
  onChange,
  strings,
}: StretchSettingsFormProps): ReactElement {
  const formatBpm = (value: number): string => `${String(value)} ${strings.bpmUnit}`
  const formatMinutes = (value: number): string => `${String(value)} ${strings.minutesUnit}`
  const formatCoolDown = (value: CoolDownMinutes): string =>
    value === 'open-ended' ? strings.holdOpenEndedLabel : `${String(value)} ${strings.minutesUnit}`

  const updateStretchSettings = (next: Partial<StretchSettings>): void => {
    onChange({ ...settings, ...next })
  }

  const updateInitialBpm = (initialBpm: number): void => {
    onChange(getStretchSettingsWithInitialBpm(settings, initialBpm))
  }

  const stretchTotalSec = computeStretchTotalSec(settings)
  const stretchDurationText = stretchTotalSec === null
    ? strings.openEndedLabel
    : `${String(Math.round(stretchTotalSec / 60))} ${strings.minutesUnit}`

  return (
    <SettingsFormShell ariaLabel={strings.ariaLabel}>
      {!isRunning && (
        <>
          <SettingsStepper
            label={strings.initialBpmLabel}
            value={settings.initialBpm}
            options={STRETCH_INITIAL_BPM_OPTIONS}
            formatValue={formatBpm}
            onChange={updateInitialBpm}
            strings={strings.stepper}
          />
          <SettingsSegmentedRow<number>
            label={strings.startRatioLabel}
            ariaLabel={strings.stepper.fieldAriaLabel(strings.startRatioLabel)}
            value={settings.inhaleShare}
            options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
            onChange={(inhaleShare) => { updateStretchSettings({ inhaleShare }) }}
          />
          <SettingsStepper
            label={strings.targetBpmLabel}
            value={settings.targetBpm}
            options={getStretchTargetBpmOptions(settings.initialBpm)}
            formatValue={formatBpm}
            onChange={(targetBpm) => { updateStretchSettings({ targetBpm }) }}
            strings={strings.stepper}
          />
          <SettingsSegmentedRow<number>
            label={strings.targetRatioLabel}
            ariaLabel={strings.stepper.fieldAriaLabel(strings.targetRatioLabel)}
            value={settings.targetInhaleShare}
            options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
            onChange={(targetInhaleShare) => { updateStretchSettings({ targetInhaleShare }) }}
          />
          <SettingsStepper<WarmUpMinutes>
            label={strings.holdInitialLabel}
            value={settings.warmUpMinutes}
            options={WARMUP_MINUTES_OPTIONS}
            formatValue={formatMinutes}
            onChange={(warmUpMinutes) => { updateStretchSettings({ warmUpMinutes }) }}
            strings={strings.stepper}
          />
          <SettingsStepper
            label={strings.rampDurationLabel}
            value={settings.rampDurationMinutes}
            options={RAMP_DURATION_OPTIONS}
            formatValue={formatMinutes}
            onChange={(rampDurationMinutes) => { updateStretchSettings({ rampDurationMinutes }) }}
            strings={strings.stepper}
          />
          <SettingsStepper<CoolDownMinutes>
            label={strings.holdTargetLabel}
            value={settings.coolDownMinutes}
            options={COOLDOWN_OPTIONS}
            formatValue={formatCoolDown}
            onChange={(coolDownMinutes) => { updateStretchSettings({ coolDownMinutes }) }}
            strings={strings.stepper}
          />
          <SettingsStepper<string>
            label={strings.durationLabel}
            value={stretchDurationText}
            options={[stretchDurationText]}
            readOnly
            onChange={ignoreReadOnlyDurationChange}
            strings={strings.stepper}
          />
        </>
      )}
    </SettingsFormShell>
  )
}
