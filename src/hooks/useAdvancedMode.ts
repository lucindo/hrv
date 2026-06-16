// App-side read of prefs.advanced (precise-control mode). Mirrors useTheme's
// listener wiring: seeds from loadPrefs, re-reads on cross-tab 'storage' and
// same-tab 'hrv:prefs-changed'. The picker-side write path is
// usePreferenceChoice('advanced') (the Settings toggle).

import { useEffect, useState } from 'react'

import { loadPrefs } from '../storage/prefs'
import { STATE_KEY } from '../storage'

export function useAdvancedMode(): boolean {
  const [advanced, setAdvanced] = useState<boolean>(() => loadPrefs().advanced)

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STATE_KEY) setAdvanced(loadPrefs().advanced)
    }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('storage', onStorage) }
  }, [])

  useEffect(() => {
    const onPrefsChanged = (e: Event): void => {
      if (!(e instanceof CustomEvent)) return
      const detail: unknown = e.detail
      const key =
        typeof detail === 'object' && detail !== null
          ? (detail as { key?: unknown }).key
          : undefined
      if (key === undefined || key === 'advanced') setAdvanced(loadPrefs().advanced)
    }
    window.addEventListener('hrv:prefs-changed', onPrefsChanged)
    return () => { window.removeEventListener('hrv:prefs-changed', onPrefsChanged) }
  }, [])

  return advanced
}
