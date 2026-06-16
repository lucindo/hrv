import { describe, expect, it } from 'vitest'

import {
  estimateNaviKriyaDurationMinutes,
  estimateNaviKriyaDurationSec,
  getNaviKriyaBackCount,
  getNaviKriyaPhaseTarget,
} from './naviKriyaSession'
import { DEFAULT_NK_SETTINGS, NK_OM_SECONDS, type NaviKriyaSettings } from './naviKriyaSettings'

describe('Navi Kriya session calculations', () => {
  it('derives the back count from the front count', () => {
    expect(getNaviKriyaBackCount(100)).toBe(25)
  })

  // The multiple-of-4 invariant is what keeps backCount = frontCount/4 a whole number;
  // the whole NK front/back split depends on it. Any frontCount that violates it must throw.
  it.each([
    ['non-multiple-of-4', 102],
    ['zero', 0],
    ['negative', -4],
    ['non-integer', 10.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('getNaviKriyaBackCount throws on a %s frontCount', (_label, frontCount) => {
    expect(() => getNaviKriyaBackCount(frontCount)).toThrow(RangeError)
  })

  it('returns front and back phase targets from settings', () => {
    expect(getNaviKriyaPhaseTarget(DEFAULT_NK_SETTINGS, 'front')).toBe(100)
    expect(getNaviKriyaPhaseTarget(DEFAULT_NK_SETTINGS, 'back')).toBe(25)
  })

  it('estimates displayed session minutes from rounds, OM length, and phase lead-ins', () => {
    expect(estimateNaviKriyaDurationMinutes(DEFAULT_NK_SETTINGS)).toBe(14)
  })

  // The seconds-level formula (not the rounded-minutes wrapper) carries the last-OM-hold
  // term and the per-round lead-ins. Pin it on a NON-default fixture so a sign/term error
  // can't round away. 200/slow/2: 2*(200 + 50 + 1)*3.0 + 2*(2*5) = 1506 + 20 = 1526s.
  it('estimates seconds from front+back+held-OM and per-round lead-ins (non-default fixture)', () => {
    const settings: NaviKriyaSettings = {
      frontCount: 200,
      omSeconds: NK_OM_SECONDS.slow,
      rounds: 2,
      perOmCue: true,
    }
    expect(estimateNaviKriyaDurationSec(settings)).toBeCloseTo(1526, 5)
  })
})
