import { describe, expect, it } from 'vitest'

import {
  isValidFrontCount,
  isValidOmSeconds,
  isValidRounds,
  DEFAULT_NK_SETTINGS,
  NK_OM_SECONDS,
} from './naviKriyaSettings'

describe('isValidFrontCount (D-02, Pitfall 5)', () => {
  it('returns true for valid multiples of 4: 4 (smallest), 100 (default)', () => {
    expect(isValidFrontCount(4)).toBe(true)
    expect(isValidFrontCount(100)).toBe(true)
  })

  it('returns false for 102 — a positive integer that is NOT a multiple of 4 (Pitfall 5 regression guard)', () => {
    expect(isValidFrontCount(102)).toBe(false)
  })

  it('returns false for 0 and negative multiples of 4', () => {
    expect(isValidFrontCount(0)).toBe(false)
    expect(isValidFrontCount(-4)).toBe(false)
  })

  it('returns false for non-integer numbers (4.5)', () => {
    expect(isValidFrontCount(4.5)).toBe(false)
  })

  it('returns false for NaN and Infinity', () => {
    expect(isValidFrontCount(NaN)).toBe(false)
    expect(isValidFrontCount(Infinity)).toBe(false)
  })

  it('returns false for wrong types: string "100", null', () => {
    expect(isValidFrontCount('100')).toBe(false)
    expect(isValidFrontCount(null)).toBe(false)
  })
})

describe('isValidOmSeconds (range 1.0–4.0)', () => {
  it('returns true for the named presets and in-range non-preset values', () => {
    expect(isValidOmSeconds(NK_OM_SECONDS.fast)).toBe(true)
    expect(isValidOmSeconds(NK_OM_SECONDS.medium)).toBe(true)
    expect(isValidOmSeconds(NK_OM_SECONDS.slow)).toBe(true)
    expect(isValidOmSeconds(1.4)).toBe(true)
  })

  it('returns true at the bounds (1.0, 4.0) and false outside them', () => {
    expect(isValidOmSeconds(1.0)).toBe(true)
    expect(isValidOmSeconds(4.0)).toBe(true)
    expect(isValidOmSeconds(0.9)).toBe(false)
    expect(isValidOmSeconds(4.1)).toBe(false)
  })

  it('returns false for wrong type / NaN', () => {
    expect(isValidOmSeconds('2')).toBe(false)
    expect(isValidOmSeconds(null)).toBe(false)
    expect(isValidOmSeconds(NaN)).toBe(false)
  })
})

describe('isValidRounds (D-02)', () => {
  it('returns true for valid integers >= 1: 1 and 3', () => {
    expect(isValidRounds(1)).toBe(true)
    expect(isValidRounds(3)).toBe(true)
  })

  it('returns false for 0 and -1', () => {
    expect(isValidRounds(0)).toBe(false)
    expect(isValidRounds(-1)).toBe(false)
  })

  it('returns false for non-integer numbers (2.5)', () => {
    expect(isValidRounds(2.5)).toBe(false)
  })

  it('returns false for NaN and Infinity', () => {
    expect(isValidRounds(NaN)).toBe(false)
    expect(isValidRounds(Infinity)).toBe(false)
  })

  it('returns false for wrong types: string "3", null', () => {
    expect(isValidRounds('3')).toBe(false)
    expect(isValidRounds(null)).toBe(false)
  })
})

describe('DEFAULT_NK_SETTINGS (D-02)', () => {
  it('equals the exact D-02 default object', () => {
    expect(DEFAULT_NK_SETTINGS).toEqual({
      frontCount: 100,
      omSeconds: NK_OM_SECONDS.medium,
      rounds: 3,
      perOmCue: true,
    })
  })
})
