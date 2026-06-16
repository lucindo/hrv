import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  BPM_MAX,
  BPM_MIN,
  COOLDOWN_OPTIONS,
  INHALE_MAX,
  INHALE_MIN,
  RAMP_DURATION_OPTIONS,
  RATIO_INHALE_PRESETS,
  STRETCH_INITIAL_BPM_MIN,
  STRETCH_INITIAL_BPM_OPTIONS,
  WARMUP_MINUTES_OPTIONS,
  computeStretchTotalSec,
  formatRatio,
  formatTrimmed,
  getStretchSettingsWithInitialBpm,
  getStretchTargetBpmOptions,
  type CoolDownMinutes,
  type StretchSettings,
  type WarmUpMinutes,
} from '../domain'
import { SettingsFormShell } from './SettingsFormShell'
import { SettingsSegmentedRow } from './SettingsSegmentedRow'
import { SettingsSlider } from './SettingsSlider'
import { SettingsStepper } from './SettingsStepper'

export interface StretchSettingsFormProps {
  isRunning: boolean
  settings: StretchSettings
  /** When true, BPM and ratio controls become continuous sliders; the initial/target
   *  BPM sliders carry dynamic bounds so they can never cross. */
  advanced?: boolean
  onChange(this: void, settings: StretchSettings): void
  strings: UiStrings['practice']['settingsForm']
}

function ignoreReadOnlyDurationChange(): void {}

// One nudge step keeps targetBpm strictly below initialBpm (Q10 dynamic bounds).
const BPM_GAP = 0.05

export function StretchSettingsForm({
  isRunning,
  settings,
  advanced = false,
  onChange,
  strings,
}: StretchSettingsFormProps): ReactElement {
  const formatBpm = (value: number): string => `${String(value)} ${strings.bpmUnit}`
  const formatBpmSlider = (value: number): string => `${formatTrimmed(value)} ${strings.bpmUnit}`
  const formatMinutes = (value: number): string => `${String(value)} ${strings.minutesUnit}`
  const formatCoolDown = (value: CoolDownMinutes): string =>
    value === 'open-ended' ? strings.holdOpenEndedLabel : `${String(value)} ${strings.minutesUnit}`

  const updateStretchSettings = (next: Partial<StretchSettings>): void => {
    onChange({ ...settings, ...next })
  }

  const updateInitialBpm = (initialBpm: number): void => {
    onChange(getStretchSettingsWithInitialBpm(settings, initialBpm))
  }

  // Dynamic bounds keep the advanced BPM sliders from crossing (target < initial),
  // rounded to 2 decimals so the slider min/max attributes stay clean.
  const round2 = (v: number): number => Math.round(v * 100) / 100
  const initialBpmMin = Math.max(STRETCH_INITIAL_BPM_MIN, round2(settings.targetBpm + BPM_GAP))
  const targetBpmMax = round2(settings.initialBpm - BPM_GAP)

  const stretchTotalSec = computeStretchTotalSec(settings)
  const stretchDurationText = stretchTotalSec === null
    ? strings.openEndedLabel
    : `${String(Math.round(stretchTotalSec / 60))} ${strings.minutesUnit}`

  return (
    <SettingsFormShell ariaLabel={strings.ariaLabel}>
      {!isRunning && (
        <>
          {advanced ? (
            <SettingsSlider
              label={strings.initialBpmLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.initialBpmLabel)}
              value={settings.initialBpm}
              min={initialBpmMin}
              max={BPM_MAX}
              nudge={0.05}
              formatValue={formatBpmSlider}
              onChange={(initialBpm) => { updateStretchSettings({ initialBpm }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsStepper
              label={strings.initialBpmLabel}
              value={settings.initialBpm}
              options={STRETCH_INITIAL_BPM_OPTIONS}
              formatValue={formatBpm}
              onChange={updateInitialBpm}
              strings={strings.stepper}
            />
          )}
          {advanced ? (
            <SettingsSlider
              label={strings.startRatioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.startRatioLabel)}
              value={settings.inhaleShare}
              min={INHALE_MIN}
              max={INHALE_MAX}
              nudge={1}
              formatValue={formatRatio}
              onChange={(inhaleShare) => { updateStretchSettings({ inhaleShare }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsSegmentedRow<number>
              label={strings.startRatioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.startRatioLabel)}
              value={settings.inhaleShare}
              options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
              onChange={(inhaleShare) => { updateStretchSettings({ inhaleShare }) }}
            />
          )}
          {advanced ? (
            <SettingsSlider
              label={strings.targetBpmLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.targetBpmLabel)}
              value={settings.targetBpm}
              min={BPM_MIN}
              max={targetBpmMax}
              nudge={0.05}
              formatValue={formatBpmSlider}
              onChange={(targetBpm) => { updateStretchSettings({ targetBpm }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsStepper
              label={strings.targetBpmLabel}
              value={settings.targetBpm}
              options={getStretchTargetBpmOptions(settings.initialBpm)}
              formatValue={formatBpm}
              onChange={(targetBpm) => { updateStretchSettings({ targetBpm }) }}
              strings={strings.stepper}
            />
          )}
          {advanced ? (
            <SettingsSlider
              label={strings.targetRatioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.targetRatioLabel)}
              value={settings.targetInhaleShare}
              min={INHALE_MIN}
              max={INHALE_MAX}
              nudge={1}
              formatValue={formatRatio}
              onChange={(targetInhaleShare) => { updateStretchSettings({ targetInhaleShare }) }}
              strings={strings.stepper}
            />
          ) : (
            <SettingsSegmentedRow<number>
              label={strings.targetRatioLabel}
              ariaLabel={strings.stepper.fieldAriaLabel(strings.targetRatioLabel)}
              value={settings.targetInhaleShare}
              options={RATIO_INHALE_PRESETS.map((id) => ({ id, label: formatRatio(id) }))}
              onChange={(targetInhaleShare) => { updateStretchSettings({ targetInhaleShare }) }}
            />
          )}
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
