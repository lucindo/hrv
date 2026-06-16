import type { ReactElement } from 'react'

import type { UiStrings } from '../content/strings'
import { SettingsRow } from './SettingsRow'

export interface SettingsSliderProps {
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  /** Delta applied by the −/+ nudge buttons. The slider itself is continuous. */
  nudge: number
  /** Rounded display label (raw value stays continuous). Also drives aria-valuetext. */
  formatValue: (value: number) => string
  onChange(this: void, value: number): void
  strings: UiStrings['practice']['settingsForm']['stepper']
}

// Reuses the SettingsStepper nudge-button chrome so slider and stepper rows read
// the same. The slider drag is continuous (step="any"); the buttons provide the
// precise ±nudge grid. aria-valuetext announces the rounded label, not the raw float.
const buttonClass =
  'grid size-8 place-items-center rounded-full border border-[var(--color-border-soft)] bg-transparent text-lg leading-none text-[var(--color-breathing-text)] transition hover:bg-[var(--color-breathing-bg-soft)] active:bg-[var(--color-breathing-bg-soft)] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-breathing-accent focus-visible:ring-offset-2'

export function SettingsSlider({
  label,
  ariaLabel,
  value,
  min,
  max,
  nudge,
  formatValue,
  onChange,
  strings,
}: SettingsSliderProps): ReactElement {
  const canDecrease = value > min
  const canIncrease = value < max

  // Nudge lands on a tidy 2-decimal grid so persisted/stepped values stay clean;
  // continuous drag still stores the raw float.
  const nudgeBy = (dir: -1 | 1): void => {
    const next = Math.min(max, Math.max(min, value + dir * nudge))
    const rounded = Math.round(next * 100) / 100
    if (rounded !== value) onChange(rounded)
  }

  return (
    <SettingsRow
      label={label}
      ariaLabel={ariaLabel}
      labelContainerClassName="mb-2"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={strings.decreaseLabel(label)}
          className={buttonClass}
          disabled={!canDecrease}
          onClick={() => { nudgeBy(-1) }}
        >
          −
        </button>
        <input
          type="range"
          aria-label={ariaLabel}
          min={min}
          max={max}
          step="any"
          value={value}
          aria-valuetext={formatValue(value)}
          onChange={(e) => { onChange(e.target.valueAsNumber) }}
          className="h-2 flex-1 cursor-pointer accent-[var(--color-breathing-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-breathing-accent focus-visible:ring-offset-2"
        />
        <button
          type="button"
          aria-label={strings.increaseLabel(label)}
          className={buttonClass}
          disabled={!canIncrease}
          onClick={() => { nudgeBy(1) }}
        >
          +
        </button>
        <output
          aria-hidden="true"
          className="min-w-[56px] text-right text-base font-medium tabular-nums text-[var(--color-breathing-text)]"
        >
          {formatValue(value)}
        </output>
      </div>
    </SettingsRow>
  )
}
