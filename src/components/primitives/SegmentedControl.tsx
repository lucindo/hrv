import type { ReactNode } from 'react'

export interface SegmentedControlOption<T extends string | number> {
  id: T
  label: string
  /** Optional glyph rendered to the left of the label. Use for icon-bearing
   *  segments (e.g. ☀️ Light / 🌙 Dark). */
  glyph?: ReactNode
}

export interface SegmentedControlProps<T extends string | number> {
  options: ReadonlyArray<SegmentedControlOption<T>>
  value: T
  onChange(this: void, next: T): void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

// SegmentedControl locked values:
// - Container: rounded-full, p-1, bg=bg-soft, 1px border-soft
// - Active button: bg=accent, color=on-accent, weight 600, no shadow
// - Inactive button: transparent, color=text-soft, weight 500
// - Buttons: flex-1, px-3 py-2, rounded-full
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className={`inline-flex w-full items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-breathing-bg-soft)] p-1 ${className}`.trim()}
    >
      {options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => {
              onChange(option.id)
            }}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-breathing-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              isActive
                ? 'bg-[var(--color-breathing-accent)] font-semibold text-[var(--color-breathing-on-accent)]'
                : 'font-medium text-[var(--color-breathing-text-soft)]'
            }`}
          >
            {option.glyph !== undefined && <span aria-hidden="true">{option.glyph}</span>}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
