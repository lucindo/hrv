import type { ReactElement } from 'react'

import { SegmentedControl, type SegmentedControlOption } from './primitives/SegmentedControl'
import { SettingsRow } from './SettingsRow'

export interface SettingsSegmentedRowProps<T extends string | number> {
  label: string
  ariaLabel: string
  value: T
  onChange(this: void, next: T): void
  options: ReadonlyArray<SegmentedControlOption<T>>
  disabled?: boolean
}

// SegmentedControl row: label on its own line above a full-width segmented
// pill, with the same border-t / py-3 row chrome as the Stepper rows so
// settings sheets read as a single stack. The fieldset wrapper preserves
// role="group" for settingGroup() queries.
export function SettingsSegmentedRow<T extends string | number>({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  disabled = false,
}: SettingsSegmentedRowProps<T>): ReactElement {
  return (
    <SettingsRow label={label} ariaLabel={ariaLabel} labelContainerClassName="mb-2 flex items-center justify-between">
      <SegmentedControl<T>
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    </SettingsRow>
  )
}
