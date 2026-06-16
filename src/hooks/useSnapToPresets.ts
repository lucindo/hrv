import { useEffect } from 'react'

// When precise control is OFF, reconcile an off-grid persisted value to the
// nearest discrete preset by firing onChange once (Q6: turning precise control
// off snaps the value so the discrete pickers stay valid and the session runs the
// shown value). `snap` MUST return the same reference when already on-grid so the
// effect is a no-op in the common case and never loops.
export function useSnapToPresets<S>(
  advanced: boolean,
  settings: S,
  snap: (s: S) => S,
  onChange: (s: S) => void,
): void {
  useEffect(() => {
    if (advanced) return
    const snapped = snap(settings)
    if (snapped !== settings) onChange(snapped)
  }, [advanced, settings, snap, onChange])
}
