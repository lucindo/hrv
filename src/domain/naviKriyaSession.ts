import type { NaviKriyaSettings } from './naviKriyaSettings'

export const NK_LEAD_SEC = 5
export const NK_LAST_OM_HOLD_MULTIPLIER = 1.5

export type NaviKriyaPhase = 'front' | 'back'

export function getNaviKriyaBackCount(frontCount: number): number {
  if (
    !Number.isFinite(frontCount)
    || !Number.isInteger(frontCount)
    || frontCount <= 0
    || frontCount % 4 !== 0
  ) {
    throw new RangeError('frontCount must be a positive integer multiple of 4')
  }
  return frontCount / 4
}

export function getNaviKriyaPhaseTarget(
  settings: NaviKriyaSettings,
  phase: NaviKriyaPhase,
): number {
  return phase === 'front'
    ? settings.frontCount
    : getNaviKriyaBackCount(settings.frontCount)
}

export function estimateNaviKriyaDurationSec(settings: NaviKriyaSettings): number {
  const backCount = getNaviKriyaBackCount(settings.frontCount)
  const omSec = settings.omSeconds
  const heldOmCount = 2 * (NK_LAST_OM_HOLD_MULTIPLIER - 1)

  return (
    settings.rounds * (settings.frontCount + backCount + heldOmCount) * omSec
    + settings.rounds * 2 * NK_LEAD_SEC
  )
}

export function estimateNaviKriyaDurationMinutes(settings: NaviKriyaSettings): number {
  return Math.round(estimateNaviKriyaDurationSec(settings) / 60)
}
