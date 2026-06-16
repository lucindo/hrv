import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readEnvelope, writeEnvelope, migrateEnvelope, STATE_KEY, STATE_VERSION } from './storage'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('readEnvelope', () => {
  it('returns empty envelope when nothing is stored', () => {
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
  })

  it('returns the parsed envelope when valid JSON is stored', () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1, settings: { bpm: 4 }, mute: true, stats: null,
    }))
    const env = readEnvelope()
    // readEnvelope preserves the on-disk numeric version (1 here) rather than
    // overwriting it with STATE_VERSION — the v1→v2 migration runs in-memory but
    // does not restamp `version` (writeEnvelope stamps STATE_VERSION on the next
    // write). The flat settings subtree round-trips unchanged.
    expect(env.version).toBe(1)
    expect(env.settings).toEqual({ bpm: 4 })
    expect(env.mute).toBe(true)
  })

  it('falls back to empty envelope when stored JSON is corrupt (D-17)', () => {
    window.localStorage.setItem(STATE_KEY, '{not-json')
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
  })

  it('falls back to empty envelope when getItem throws (D-17 — Safari ITP)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
  })

  it('falls back to empty envelope when stored value is a non-object (array / number / string)', () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify([1, 2, 3]))
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
    window.localStorage.setItem(STATE_KEY, JSON.stringify(42))
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
    window.localStorage.setItem(STATE_KEY, JSON.stringify('str'))
    expect(readEnvelope()).toEqual({ version: STATE_VERSION })
  })
})

describe('writeEnvelope', () => {
  it('persists the envelope with version stamped', () => {
    writeEnvelope({ version: STATE_VERSION, settings: { bpm: 4 } })
    const raw = window.localStorage.getItem(STATE_KEY)
    expect(raw).not.toBeNull()
    // Reason: raw non-null asserted by expect().not.toBeNull() immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(JSON.parse(raw!) as unknown).toMatchObject({ version: STATE_VERSION, settings: { bpm: 4 } })
  })

  it('silently absorbs QuotaExceededError on setItem (D-16)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const e = new Error('quota')
      e.name = 'QuotaExceededError'
      throw e
    })
    expect(() => { writeEnvelope({ version: STATE_VERSION }) }).not.toThrow()
  })

  it('silently absorbs SecurityError on setItem (D-16 — Safari ITP / private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => { writeEnvelope({ version: STATE_VERSION, mute: true }) }).not.toThrow()
  })

  it('fails OPEN and still writes when the inner version re-read throws (Safari ITP)', () => {
    // The version guard must distinguish "disk holds a newer schema" from "cannot read
    // the disk version". When the inner getItem throws, it must assume STATE_VERSION and
    // proceed — NOT let the throw skip the write. Asserted via the setItem spy because a
    // throwing getItem makes reading the value back impossible.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    writeEnvelope({ version: STATE_VERSION, settings: { bpm: 6 } })

    expect(setItemSpy).toHaveBeenCalledTimes(1)
    const [key, payload] = setItemSpy.mock.calls[0] ?? []
    expect(key).toBe(STATE_KEY)
    expect(JSON.parse(payload ?? '{}') as unknown)
      .toMatchObject({ version: STATE_VERSION, settings: { bpm: 6 } })
  })

  it('preserves on-disk version when reading; stamps STATE_VERSION on write', () => {
    // Seed a v5 envelope (simulates a future schema written by a newer build
    // in another tab). Must be > STATE_VERSION (4) to exercise the future-version
    // guard. `prefs` is the forward-compat probe — the spread must let it survive
    // the readEnvelope round-trip.
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 5, settings: { bpm: 4 }, prefs: { theme: 'dark' },
    }))
    // STORAGE-01: readEnvelope returns the on-disk numeric version (5),
    // NOT STATE_VERSION (4). The known settings subtree round-trips.
    const env = readEnvelope()
    expect(env.version).toBe(5)
    expect(env.settings).toEqual({ bpm: 4 })
    // STORAGE-01: unknown top-level fields survive the read (positive forward-compat
    // coverage). Type-cast required because Envelope.prefs is not statically declared.
    // Without this assertion a regression to a pick-only-known-keys readEnvelope
    // would not be caught by the post-write disk-dump check.
    expect((env as unknown as Record<string, unknown>).prefs)
      .toEqual({ theme: 'dark' })
    // STORAGE-02: disk version 5 > STATE_VERSION 4 → write refused.
    // The caller's `version: 1` does NOT require an `as any` cast because
    // Envelope.version is widened to `number`.
    writeEnvelope({ version: 1, settings: { bpm: 5 } })
    // Disk unchanged: the refused write left the v5 envelope intact.
    const rawAfter = window.localStorage.getItem(STATE_KEY)
    expect(rawAfter).not.toBeNull()
    // Reason: rawAfter non-null asserted by expect().not.toBeNull() above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(JSON.parse(rawAfter!) as unknown).toMatchObject({ version: 5, settings: { bpm: 4 } })
  })

  it('writeEnvelope refuses to overwrite a future-version on-disk envelope (STORAGE-02)', () => {
    // Seed a v5-only envelope (no known subtrees) to isolate the version guard.
    // v5 > STATE_VERSION (4) makes it a genuine future schema.
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 5 }))
    // Caller attempts to land 99-session stats on top of the v5 envelope.
    // The 99-session probe gives the negative assertion something concrete
    // to test — if the guard fails, the stats subtree appears on disk.
    writeEnvelope({
      version: 1,
      stats: {
        totalSessions: 99,
        totalElapsedSeconds: 0,
        lastSessionAtMs: null,
        lastSessionDurationSeconds: null,
      },
    })
    // Silent refusal: disk envelope unchanged at version: 5.
    const rawAfter = window.localStorage.getItem(STATE_KEY)
    expect(rawAfter).not.toBeNull()
    // Reason: rawAfter non-null asserted by expect().not.toBeNull() above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(JSON.parse(rawAfter!) as unknown).toMatchObject({ version: 5 })
    // Negative: 99-session probe was NOT written.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(JSON.parse(rawAfter!) as unknown).not.toMatchObject({ stats: { totalSessions: 99 } })
  })
})

describe('migrateEnvelope v1→v2 (PRACTICE-04)', () => {
  // A returning user's flat v1 envelope. settings/stats are deliberately shaped
  // like real subtrees so the lossless-fold assertions are concrete.
  const V1_SETTINGS = { bpm: 4, ratio: '40:60', durationMinutes: 10 }
  const V1_STATS = {
    totalSessions: 7,
    totalElapsedSeconds: 4200,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 600,
  }

  it('folds a flat v1 envelope into practices.resonant losslessly', () => {
    const migrated = migrateEnvelope(
      { version: 1, settings: V1_SETTINGS, stats: V1_STATS },
      1,
    )
    const practices = migrated.practices as {
      resonant: { settings: unknown; stats: unknown }
    }
    // The flat resonant data is carried into practices.resonant, with the v3→v4
    // step adding numeric inhaleShare from the legacy ratio label (orphan kept).
    expect(practices.resonant.settings).toEqual({ ...V1_SETTINGS, inhaleShare: 40 })
    expect(practices.resonant.stats).toEqual(V1_STATS)
    expect(migrated.activePractice).toBe('resonant')
  })

  it('does not delete the original flat settings/stats fields (forward-compat orphans)', () => {
    const migrated = migrateEnvelope(
      { version: 1, settings: V1_SETTINGS, stats: V1_STATS },
      1,
    )
    // The flat fields survive as harmless orphans — the top-level spread in
    // readEnvelope preserves them; this is what keeps the migration lossless.
    expect(migrated.settings).toEqual(V1_SETTINGS)
    expect(migrated.stats).toEqual(V1_STATS)
  })

  it('is idempotent at the terminal version (fromVersion >= STATE_VERSION skips every ladder step)', () => {
    const terminalEnvelope = {
      version: STATE_VERSION,
      practices: {
        resonant: { settings: { ...V1_SETTINGS, inhaleShare: 40 }, stats: V1_STATS },
        stretch: { settings: { ...V1_SETTINGS, inhaleShare: 40 }, stats: { totalSessions: 0, totalElapsedSeconds: 0, lastSessionAtMs: null, lastSessionDurationSeconds: null } },
        naviKriya: { settings: {}, stats: {} },
      },
      activePractice: 'naviKriya',
    }
    const out = migrateEnvelope(terminalEnvelope, STATE_VERSION)
    // Every guard is false — practices/activePractice pass through unchanged,
    // including a non-default activePractice.
    expect(out.practices).toEqual(terminalEnvelope.practices)
    expect(out.activePractice).toBe('naviKriya')
  })

  it('populates practices.resonant when a seeded v1 envelope is read back', () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1, settings: V1_SETTINGS, stats: V1_STATS,
    }))
    const env = readEnvelope()
    const practices = env.practices as {
      resonant: { settings: unknown; stats: unknown }
    }
    expect(practices.resonant.settings).toEqual({ ...V1_SETTINGS, inhaleShare: 40 })
    expect(practices.resonant.stats).toEqual(V1_STATS)
    expect(env.activePractice).toBe('resonant')
  })

  it('STATE_KEY stays exactly "hrv:state:v1" after a write (no accidental key bump)', () => {
    // The :v1 suffix is the key NAME, not the version field. Bumping
    // STATE_VERSION must never touch STATE_KEY (the FOUC script depends on it).
    expect(STATE_KEY).toBe('hrv:state:v1')
    writeEnvelope({ version: STATE_VERSION, settings: V1_SETTINGS })
    expect(window.localStorage.getItem('hrv:state:v1')).not.toBeNull()
    expect(STATE_KEY).toBe('hrv:state:v1')
  })
})

describe('migrateEnvelope v2→v3 (Phase 34 STRETCH-03)', () => {
  // A v2 envelope representing a returning user with resonant ramp fields stored
  // in their resonant settings blob.
  const RESONANT_SETTINGS_WITH_RAMP = {
    bpm: 5.5,
    ratio: '40:60',
    durationMinutes: 10,
    initialBpm: 6,
    targetBpm: 4,
    warmUpMinutes: 5,
    coolDownMinutes: 5,
    rampDurationMinutes: 5,
  }
  const RESONANT_STATS = {
    totalSessions: 3,
    totalElapsedSeconds: 1800,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 600,
  }
  const V2_ENVELOPE = {
    version: 2,
    practices: {
      resonant: {
        settings: RESONANT_SETTINGS_WITH_RAMP,
        stats: RESONANT_STATS,
      },
      naviKriya: {
        settings: { frontCount: 80, omLength: 'slow', rounds: 3, perOmCue: false },
        stats: { totalSessions: 1, totalElapsedSeconds: 600, lastSessionAtMs: null, lastSessionDurationSeconds: null },
      },
    },
    activePractice: 'resonant',
  }

  const ZERO_STATS_LITERAL = {
    totalSessions: 0,
    totalElapsedSeconds: 0,
    lastSessionAtMs: null,
    lastSessionDurationSeconds: null,
  }

  it('seeds practices.stretch.settings from the resonant settings blob', () => {
    const migrated = migrateEnvelope(V2_ENVELOPE, 2)
    const practices = migrated.practices as Record<string, unknown>
    const stretch = practices['stretch'] as { settings: unknown; stats: unknown }
    // v3→v4 also adds inhaleShare from the seeded blob's ratio label.
    expect(stretch.settings).toEqual({ ...RESONANT_SETTINGS_WITH_RAMP, inhaleShare: 40 })
  })

  it('seeds practices.stretch.stats with ZERO stats (inline literal)', () => {
    const migrated = migrateEnvelope(V2_ENVELOPE, 2)
    const practices = migrated.practices as Record<string, unknown>
    const stretch = practices['stretch'] as { settings: unknown; stats: unknown }
    expect(stretch.stats).toEqual(ZERO_STATS_LITERAL)
  })

  it('preserves practices.resonant (ramp orphans intact), adding inhaleShare from its ratio label', () => {
    const migrated = migrateEnvelope(V2_ENVELOPE, 2)
    const practices = migrated.practices as Record<string, { settings: unknown; stats: unknown }>
    const resonant = practices['resonant']
    if (resonant === undefined) throw new Error('Expected resonant practice after migration')
    expect(resonant.settings).toEqual({ ...RESONANT_SETTINGS_WITH_RAMP, inhaleShare: 40 })
    expect(resonant.stats).toEqual(RESONANT_STATS)
  })

  it('is idempotent — running migration twice on the same v2 envelope produces the same result', () => {
    const once = migrateEnvelope(V2_ENVELOPE, 2)
    // Run again simulating re-read: fromVersion is still 2 for the original envelope
    const twice = migrateEnvelope(V2_ENVELOPE, 2)
    expect(once).toEqual(twice)
  })

  it('skips the v2→v3 step when fromVersion >= 3 (envelope returned unchanged)', () => {
    const v3Envelope = { version: 3, practices: { stretch: { settings: {}, stats: {} } } }
    const out = migrateEnvelope(v3Envelope, 3)
    expect(out.practices).toEqual(v3Envelope.practices)
  })

  it('STATE_VERSION is 4', () => {
    expect(STATE_VERSION).toBe(4)
  })
})

describe('migrateEnvelope v1→v3 chained (HOUSE-09)', () => {
  // A v1 flat envelope from a returning user who has never opened the app since
  // the v2 or v3 ladder shipped. migrateEnvelope(env, 1) must cascade BOTH
  // ladder steps (v1→v2 then v2→v3) in a single call.
  //
  // This block asserts only what `migrateEnvelope` actually produces —
  // resonant + stretch + activePractice. naviKriya seeding is NOT asserted
  // because `migrateEnvelope` does not seed naviKriya; defaults are supplied
  // downstream by `coercePractices`.
  // The v1→v2 analog block above also omits naviKriya assertions.
  //
  // The inline ZERO_STATS_LITERAL guards the circular-dep boundary called
  // out at src/storage/storage.ts:112-113 — stats.ts imports from storage.ts,
  // so importing ZERO_STATS from stats.ts here would create a cycle.
  const V1_SETTINGS = { bpm: 4, ratio: '40:60', durationMinutes: 10 }
  const V1_STATS = {
    totalSessions: 7,
    totalElapsedSeconds: 4200,
    lastSessionAtMs: 1_700_000_000_000,
    lastSessionDurationSeconds: 600,
  }
  const ZERO_STATS_LITERAL = {
    totalSessions: 0,
    totalElapsedSeconds: 0,
    lastSessionAtMs: null,
    lastSessionDurationSeconds: null,
  }

  it('folds a v1 flat envelope all the way to v3 in one call', () => {
    const migrated = migrateEnvelope(
      { version: 1, settings: V1_SETTINGS, stats: V1_STATS },
      1,
    )
    const practices = migrated.practices as {
      resonant: { settings: unknown; stats: unknown }
      stretch: { settings: unknown; stats: unknown }
    }
    // v1→v2 step: resonant slice populated from flat fields; v3→v4 adds inhaleShare.
    expect(practices.resonant.settings).toEqual({ ...V1_SETTINGS, inhaleShare: 40 })
    expect(practices.resonant.stats).toEqual(V1_STATS)
    expect(migrated.activePractice).toBe('resonant')
    // v2→v3 step: stretch slice seeded from the resonant blob (downstream
    // coerceStretchSettings validates ramp fields), stats ZERO; v3→v4 adds inhaleShare.
    expect(practices.stretch.settings).toEqual({ ...V1_SETTINGS, inhaleShare: 40 })
    expect(practices.stretch.stats).toEqual(ZERO_STATS_LITERAL)
  })

  it('is idempotent — re-migrating the v3 output is a no-op', () => {
    const once = migrateEnvelope(
      { version: 1, settings: V1_SETTINGS, stats: V1_STATS },
      1,
    )
    // Feed the output back through with its terminal version. STATE_VERSION (3)
    // means both fromVersion < 2 and fromVersion < 3 guards are false — the
    // returned envelope must equal `once` (modulo the `version` field, which
    // writeEnvelope stamps, not migrateEnvelope). Catches a regression where,
    // e.g., the v2→v3 step started overwriting an already-present `stretch`
    // slice on a v3 input.
    const twice = migrateEnvelope(once, STATE_VERSION)
    expect(twice).toEqual(once)
  })

  it('STATE_VERSION is 4 (ladder terminal)', () => {
    // Locks the test against silent ladder extension — if a future v4→v5 step
    // ships, this assertion fails and forces the HOUSE-09 regression to be
    // re-evaluated against the new terminal.
    expect(STATE_VERSION).toBe(4)
  })
})

describe('migrateEnvelope v3→v4 (ratio label → inhaleShare)', () => {
  it('converts a resonant ratio label to numeric inhaleShare, keeping the label orphan', () => {
    const env = {
      version: 3,
      practices: { resonant: { settings: { bpm: 4, ratio: '30:70', durationMinutes: 10 }, stats: {} } },
    }
    const out = migrateEnvelope(env, 3)
    const resonant = (out.practices as Record<string, { settings: Record<string, unknown> }>)['resonant']
    expect(resonant?.settings).toMatchObject({ inhaleShare: 30, ratio: '30:70' })
  })

  it('converts stretch ratio + targetRatio to inhaleShare + targetInhaleShare', () => {
    const env = {
      version: 3,
      practices: { stretch: { settings: { ratio: '50:50', targetRatio: '20:80', initialBpm: 6, targetBpm: 4 }, stats: {} } },
    }
    const out = migrateEnvelope(env, 3)
    const stretch = (out.practices as Record<string, { settings: Record<string, unknown> }>)['stretch']
    expect(stretch?.settings).toMatchObject({ inhaleShare: 50, targetInhaleShare: 20 })
  })

  it('leaves a slice with no ratio label untouched', () => {
    const env = { version: 3, practices: { resonant: { settings: { bpm: 4, durationMinutes: 10 }, stats: {} } } }
    const out = migrateEnvelope(env, 3)
    expect(out.practices).toEqual(env.practices)
  })

  it('is idempotent — re-migrating already-numeric v4 data adds nothing', () => {
    const v4 = {
      version: 4,
      practices: { resonant: { settings: { bpm: 4, inhaleShare: 30, durationMinutes: 10 }, stats: {} } },
    }
    const out = migrateEnvelope(v4, 4)
    expect(out.practices).toEqual(v4.practices)
  })
})
