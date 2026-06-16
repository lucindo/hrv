import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSnapToPresets } from './useSnapToPresets'

// Toy field standing in for a real settings slice: "on-grid" = even number.
// snapEven returns the SAME reference when already on-grid — the no-loop contract
// every snap*ToPresets in the domain upholds. These tests pin the hook's reliance
// on that contract (the sole enforcement of "advanced off ⇒ discrete value").
interface Box {
  readonly n: number
}

const snapEven = (s: Box): Box => (s.n % 2 === 0 ? s : { n: s.n - 1 })

describe('useSnapToPresets', () => {
  it('does not fire onChange when the value is already on-grid', () => {
    const onChange = vi.fn()
    renderHook(() => { useSnapToPresets(false, { n: 4 }, snapEven, onChange) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not fire onChange while advanced is on, even for an off-grid value', () => {
    const onChange = vi.fn()
    renderHook(() => { useSnapToPresets(true, { n: 3 }, snapEven, onChange) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('snaps an off-grid value once and converges without looping', () => {
    const onChange = vi.fn()
    let settings: Box = { n: 5 }
    const { rerender } = renderHook(
      ({ s }: { s: Box }) => {
        useSnapToPresets(false, s, snapEven, (next: Box) => {
          settings = next
          onChange(next)
        })
      },
      { initialProps: { s: settings } },
    )
    // Mount fired the snap (5 → 4) exactly once.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(settings).toEqual({ n: 4 })
    // Feed the snapped (now on-grid) value back: same reference → no further fire.
    act(() => { rerender({ s: settings }) })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
