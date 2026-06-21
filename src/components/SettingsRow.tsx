import type { ReactElement, ReactNode } from 'react'

export interface SettingsRowProps {
  label: string
  ariaLabel: string
  /** Additional className applied to the fieldset (e.g. 'flex items-center justify-between') */
  className?: string
  /**
   * When true, omits the border-t divider. Used when the row is the sole
   * row inside a container that already provides visual separation (e.g. the
   * HRV-running inline Duration card whose surrounding rounded card already
   * separates the row from page content). Corresponds to SettingsStepper's
   * hideTopBorder prop.
   */
  noBorder?: boolean
  /**
   * When provided, the label span is wrapped in a <div> with this className.
   * Used by SettingsSegmentedRow (column layout: label above the full-width
   * segmented pill, separated by mb-2 spacing). Omit for inline row layouts
   * (Toggle, Stepper) where label and control are siblings in a flex container.
   */
  labelContainerClassName?: string
  /** When true, dims the label to match a disabled control (whole-row dim). */
  dimmed?: boolean
  children: ReactNode
}

// Shared row chrome for all settings rows: fieldset wrapper with border-t / py-3
// divider chrome, a 15 px label span, and a children slot for the domain control.
// Each Settings*Row adapter supplies its layout className and unique control.
//
// The fieldset wrapper preserves role="group" for settingGroup() queries in
// appTestHarness — adapters must not replace it with a plain div.
export function SettingsRow({
  label,
  ariaLabel,
  className,
  noBorder = false,
  labelContainerClassName,
  dimmed = false,
  children,
}: SettingsRowProps): ReactElement {
  const fieldsetClass = [
    noBorder ? 'py-3' : 'border-t border-[var(--color-border-soft)] py-3',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const labelSpan = (
    <span
      className={`text-[15px] font-normal text-[var(--color-breathing-text)]${dimmed ? ' opacity-45' : ''}`}
    >
      {label}
    </span>
  )

  return (
    <fieldset aria-label={ariaLabel} className={fieldsetClass}>
      {labelContainerClassName != null ? (
        <div className={labelContainerClassName}>{labelSpan}</div>
      ) : (
        labelSpan
      )}
      {children}
    </fieldset>
  )
}
