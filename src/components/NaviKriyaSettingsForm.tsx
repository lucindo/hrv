import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import {
  NK_FRONT_COUNT_OPTIONS,
  NK_OM_SECONDS,
  NK_ROUNDS_OPTIONS,
  OM_LENGTH_OPTIONS,
  OM_SECONDS_MAX,
  OM_SECONDS_MIN,
  estimateNaviKriyaDurationMinutes,
  formatTrimmed,
  type NaviKriyaSettings,
  type OmLength,
} from '../domain'
import { SettingsFormShell } from './SettingsFormShell'
import { SettingsSegmentedRow } from './SettingsSegmentedRow'
import { SettingsSlider } from './SettingsSlider'
import { SettingsStepper } from './SettingsStepper'
import { SettingsToggleRow } from './SettingsToggleRow'

export interface NaviKriyaSettingsFormProps {
  settings: NaviKriyaSettings
  /** When true, the OM-pace control becomes a continuous seconds-per-OM slider. */
  advanced?: boolean
  onChange(this: void, settings: NaviKriyaSettings): void
  strings: UiStrings['practice']['settingsForm']
  nkControlsStrings: UiStrings['practice']['nkControls']
}

export function NaviKriyaSettingsForm({
  settings,
  advanced = false,
  onChange,
  strings,
  nkControlsStrings,
}: NaviKriyaSettingsFormProps): ReactElement {
  const formatOmLength = (value: OmLength): string =>
    value === 'fast'
      ? nkControlsStrings.omLengthFast
      : value === 'slow'
        ? nkControlsStrings.omLengthSlow
        : nkControlsStrings.omLengthMedium
  const formatOmSeconds = (value: number): string => `${formatTrimmed(value)} s`

  const updateNkSettings = (next: Partial<NaviKriyaSettings>): void => {
    onChange({ ...settings, ...next })
  }

  const estimatedMinutes = estimateNaviKriyaDurationMinutes(settings)

  return (
    <SettingsFormShell ariaLabel={strings.ariaLabel}>
      <SettingsStepper<number>
        label={nkControlsStrings.roundsLabel}
        value={settings.rounds}
        options={NK_ROUNDS_OPTIONS}
        onChange={(rounds) => { updateNkSettings({ rounds }) }}
        strings={strings.stepper}
      />
      <SettingsStepper<number>
        label={nkControlsStrings.frontCountLabel}
        value={settings.frontCount}
        options={NK_FRONT_COUNT_OPTIONS}
        onChange={(frontCount) => { updateNkSettings({ frontCount }) }}
        strings={strings.stepper}
      />
      {advanced ? (
        <SettingsSlider
          label={nkControlsStrings.omLengthLabel}
          ariaLabel={strings.stepper.fieldAriaLabel(nkControlsStrings.omLengthLabel)}
          value={settings.omSeconds}
          min={OM_SECONDS_MIN}
          max={OM_SECONDS_MAX}
          nudge={0.05}
          formatValue={formatOmSeconds}
          onChange={(omSeconds) => { updateNkSettings({ omSeconds }) }}
          strings={strings.stepper}
        />
      ) : (
        <SettingsSegmentedRow<number>
          label={nkControlsStrings.omLengthLabel}
          ariaLabel={strings.stepper.fieldAriaLabel(nkControlsStrings.omLengthLabel)}
          value={settings.omSeconds}
          options={OM_LENGTH_OPTIONS.map((id) => ({ id: NK_OM_SECONDS[id], label: formatOmLength(id) }))}
          onChange={(omSeconds) => { updateNkSettings({ omSeconds }) }}
        />
      )}
      <SettingsToggleRow
        label={nkControlsStrings.perOmCueLabel}
        ariaLabel={nkControlsStrings.perOmCueLabel}
        checked={settings.perOmCue}
        onChange={(perOmCue) => { updateNkSettings({ perOmCue }) }}
      />
      <p
        aria-live="polite"
        className="mt-3 text-center text-sm text-[var(--color-breathing-muted)]"
      >
        {nkControlsStrings.estimatedDuration(estimatedMinutes)}
      </p>
    </SettingsFormShell>
  )
}
