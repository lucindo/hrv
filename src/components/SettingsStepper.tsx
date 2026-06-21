import type { UiStrings } from '../content/strings'

import { SettingsRow } from './SettingsRow'

export interface SettingsStepperProps<T extends string | number> {
  label: string
  value: T
  options: readonly T[]
  formatValue?: (value: T) => string
  onChange(this: void, value: T): void
  disabled?: boolean
  disableDecrease?: boolean
  disableIncrease?: boolean
  /** When true, render label + value only (no +/- buttons) — read-only field
   *  used by the Stretch sheet's derived total Duration row. */
  readOnly?: boolean
  /** When true, drops the row's `border-t` divider. Used when the stepper
   *  is the sole row inside its container (e.g. the HRV-running inline
   *  Duration card, where the surrounding rounded card already separates
   *  the row from page content). */
  hideTopBorder?: boolean
  strings: UiStrings['practice']['settingsForm']['stepper']
}

// Stepper row layout. Locked values:
// - Row: label left / [- value unit +] right
// - py-3, 1 px border-soft top
// - Label: 15 px / weight 400 / text token
// - Value: 16 px / weight 500 / text token / tabular-nums; unit 12 px / muted
// - Buttons: 32 × 32 round / 1 px border-soft / transparent bg / text token
//
// The fieldset wrapper preserves role="group" + the aria-label that
// `settingGroup(name)` in appTestHarness queries against. No visible legend —
// the inline label span serves both visual and a11y.
export function SettingsStepper<T extends string | number>({
  label,
  value,
  options,
  formatValue = String,
  onChange,
  disabled = false,
  disableDecrease = false,
  disableIncrease = false,
  readOnly = false,
  hideTopBorder = false,
  strings,
}: SettingsStepperProps<T>) {
  const selectedIndex = options.indexOf(value)
  const canDecrease = selectedIndex > 0
  const canIncrease = selectedIndex >= 0 && selectedIndex < options.length - 1

  const changeBy = (offset: -1 | 1) => {
    const next = selectedIndex + offset
    if (next < 0 || next >= options.length) return
    const nextValue = options[next]
    if (nextValue !== undefined) {
      onChange(nextValue)
    }
  }

  const buttonClass =
    'grid size-8 place-items-center rounded-full border border-[var(--color-border-soft)] bg-transparent text-lg leading-none text-[var(--color-breathing-text)] transition hover:bg-[var(--color-breathing-bg-soft)] active:bg-[var(--color-breathing-bg-soft)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-breathing-accent focus-visible:ring-offset-2'

  return (
    <SettingsRow
      label={label}
      ariaLabel={strings.fieldAriaLabel(label)}
      className="flex items-center justify-between"
      noBorder={hideTopBorder}
      dimmed={disabled}
    >
      {readOnly ? (
        <output
          aria-live="off"
          className="text-base font-medium tabular-nums text-[var(--color-breathing-text)]"
        >
          {formatValue(value)}
        </output>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={strings.decreaseLabel(label)}
            className={buttonClass}
            disabled={disabled || disableDecrease || !canDecrease}
            onClick={() => { changeBy(-1) }}
          >
            −
          </button>
          <output
            aria-live="polite"
            className={`min-w-[72px] text-center text-base font-medium tabular-nums text-[var(--color-breathing-text)]${disabled ? ' opacity-45' : ''}`}
          >
            {formatValue(value)}
          </output>
          <button
            type="button"
            aria-label={strings.increaseLabel(label)}
            className={buttonClass}
            disabled={disabled || disableIncrease || !canIncrease}
            onClick={() => { changeBy(1) }}
          >
            +
          </button>
        </div>
      )}
    </SettingsRow>
  )
}
