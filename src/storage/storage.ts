// src/storage/storage.ts
//
// Silent-fallback envelope adapter for localStorage. Every risky op is wrapped
// in try { } catch { } and the catch swallows ALL errors. Caller continues with
// in-memory defaults. No warn/log in production; gate on `import.meta.env.DEV`
// if you add logging.

// Dual-versioning convention:
//   - STATE_KEY suffix (':v1') — bump only for breaking shape changes where old
//     data is unmigratable; it gets orphaned and the user sees defaults.
//   - STATE_VERSION (in-envelope) — bump for migrate-on-read schema changes
//     handled by migrateEnvelope + per-field coercers; the user keeps their data.
//
// SYNC WITH index.html FOUC SCRIPT: it hardcodes both 'hrv:state:v1' and the
// `JSON.parse(raw).prefs.theme` path. If the key suffix bumps or the prefs
// subtree moves, update the FOUC script too — nothing in the build catches the
// desync, and returning users get a theme flash on every load.
export const STATE_KEY = 'hrv:state:v1'
// STATE_VERSION bumped 3→4: migrateEnvelope converts ratio labels ('40:60') to
// numeric inhaleShare (resonant + stretch) and omLength ('medium') to numeric
// omSeconds (naviKriya) — the advanced precise-control number model.
// Bumped 4→5: resonant settings gained `rounds` / `restMinutes`. Purely additive —
// coerceSettings supplies defaults for the absent fields, so no migrateEnvelope
// rewrite branch is needed; the bump only arms the downgrade guard so an older
// build can't strip the new fields on write.
export const STATE_VERSION = 5 as const

export interface StorageDeps {
  now?: () => number       // defaults to Date.now (consumed by stats.ts / format.ts)
  storage?: Storage        // defaults to window.localStorage
}

export interface Envelope {
  // Widened from `typeof STATE_VERSION` (literal 1) to `number` so readEnvelope
  // can surface an on-disk version > STATE_VERSION when a newer build has written
  // to the same key from another tab. EMPTY_ENVELOPE still compiles because
  // STATE_VERSION (`3 as const`) is assignable to number.
  // Forward-compat is carried via the runtime `...p` spread, not the static type;
  // the static surface remains the known fields.
  version: number
  settings?: unknown
  mute?: unknown
  stats?: unknown
  // Static type acknowledges the runtime forward-compat proven by the prefs probe
  // in storage.test.ts. `unknown` mirrors settings/mute/stats; coercer narrows at
  // the boundary. Avoids storage→domain typed circular import.
  prefs?: unknown
  // The v2 per-practice subtree. `practices` holds a { resonant, naviKriya } map
  // of settings+stats slices; `activePractice` is the selected practice id.
  // Both `unknown` — coercePractices / coerceActivePractice narrow at the boundary.
  practices?: unknown
  activePractice?: unknown
}

const EMPTY_ENVELOPE: Envelope = { version: STATE_VERSION }

// Prototype-pollution-safe object guard: only treat `raw` as a record when it is
// a plain non-array object; otherwise hand back an empty record so every named-key
// read falls through to a default. Shared by the per-field coercers in
// settings.ts / prefs.ts / practices.ts.
export function asRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

/**
 * Explicit migrate-on-read seam.
 *
 * Applied in `readEnvelope` before the envelope reaches the per-field coercers.
 * The forward-compatible top-level spread is preserved — the returned envelope is
 * a `{ ...env }` superset so unknown top-level fields written by a newer build
 * survive the read+write round-trip.
 *
 * v1→v2 ladder: when `fromVersion < 2`, a pre-existing flat v1 envelope is folded
 * into the v2 per-practice shape. The user's flat `settings`/`stats` become
 * `practices.resonant.{settings,stats}` (still `unknown` — downstream coercers
 * validate them field-by-field as always), and `activePractice` is seeded to
 * `'resonant'`. The flat `settings`/`stats` fields are deliberately NOT deleted:
 * the forward-compat spread preserves them as harmless orphans, keeping the
 * migration lossless. naviKriya is intentionally absent so coercePractices
 * supplies defaults. The ladder is idempotent — a v2 envelope skips the step.
 */
export function migrateEnvelope(env: Envelope, fromVersion: number): Envelope {
  let out: Envelope = { ...env }

  if (fromVersion < 2) {
    // Coerce a flat v1 envelope into the v2 per-practice shape. out.settings /
    // out.stats are the existing resonant data (unknown — coercers validate
    // downstream). naviKriya is omitted so coercePractices supplies defaults.
    out = {
      ...out,
      practices: {
        resonant: { settings: out.settings, stats: out.stats },
      },
      activePractice: 'resonant',
    }
  }

  if (fromVersion < 3) {
    // v2→v3: create the stretch slice.
    // Seed settings from the resonant blob (still unknown — coerceStretchSettings validates downstream).
    // Leave the resonant blob untouched — orphan fields are fine (v1→v2 precedent).
    // CRITICAL: Do NOT import ZERO_STATS from stats.ts — stats.ts imports from storage.ts,
    //           creating a circular dep. Use the inline literal instead.
    const existingPractices = asRecord(out.practices)
    const resonantSlice = asRecord(existingPractices['resonant'])
    const resonantSettings = resonantSlice['settings']  // unknown — coerceStretchSettings validates downstream
    out = {
      ...out,
      practices: {
        ...existingPractices,
        stretch: {
          settings: resonantSettings,  // carries ramp fields; downstream coercer validates
          stats: {                     // inline literal — no circular dep
            totalSessions: 0,
            totalElapsedSeconds: 0,
            lastSessionAtMs: null,
            lastSessionDurationSeconds: null,
          },
        },
      },
    }
    // resonant slice is untouched — stretch ramp fields remain there as harmless orphans
  }

  if (fromVersion < 4) {
    // v3→v4: ratio labels become numeric inhaleShare. The legacy label→share map is
    // frozen historical data (like LEGACY_TIMBRE_REMAP in prefs.ts) and lives here,
    // not in the domain — the domain no longer knows the label form. Old `ratio` /
    // `targetRatio` keys are left as harmless orphans (lossless-migration precedent).
    // Only slices that actually carry a label are rewritten — absent slices and
    // already-numeric ones pass through untouched, keeping the step idempotent.
    const RATIO_LABEL_TO_INHALE: Readonly<Record<string, number>> = {
      '50:50': 50, '40:60': 40, '30:70': 30, '20:80': 20,
    }
    const toShare = (label: unknown): number | undefined =>
      typeof label === 'string' ? RATIO_LABEL_TO_INHALE[label] : undefined
    const practices = asRecord(out.practices)
    const next: Record<string, unknown> = { ...practices }
    for (const key of ['resonant', 'stretch']) {
      if (practices[key] === undefined) continue
      const slice = asRecord(practices[key])
      const settings = asRecord(slice.settings)
      const inhaleShare = toShare(settings.ratio)
      const targetInhaleShare = toShare(settings.targetRatio)
      if (inhaleShare === undefined && targetInhaleShare === undefined) continue
      next[key] = {
        ...slice,
        settings: {
          ...settings,
          ...(inhaleShare !== undefined ? { inhaleShare } : {}),
          ...(targetInhaleShare !== undefined ? { targetInhaleShare } : {}),
        },
      }
    }
    // naviKriya: omLength label ('fast'/'medium'/'slow') → numeric omSeconds.
    const OM_LENGTH_TO_SECONDS: Readonly<Record<string, number>> = {
      fast: 1.75, medium: 2.16, slow: 3.0,
    }
    if (practices['naviKriya'] !== undefined) {
      const slice = asRecord(practices['naviKriya'])
      const settings = asRecord(slice.settings)
      const omSeconds = typeof settings.omLength === 'string'
        ? OM_LENGTH_TO_SECONDS[settings.omLength]
        : undefined
      if (omSeconds !== undefined) {
        next['naviKriya'] = { ...slice, settings: { ...settings, omSeconds } }
      }
    }
    out = { ...out, practices: next }
  }

  return out
}

export function readEnvelope(deps: StorageDeps = {}): Envelope {
  const storage = deps.storage ?? window.localStorage
  try {
    const raw = storage.getItem(STATE_KEY)
    if (raw === null) return { ...EMPTY_ENVELOPE }
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Forward-compatible read.
      //   - Spread `p` FIRST so unknown top-level fields written by a future
      //     build survive the round-trip. Earlier code picked only the known
      //     subtree keys — that silently discarded forward-compatible fields and
      //     broke the "newer build wrote here, older build is reading" invariant
      //     locked by the write-side guard in writeEnvelope.
      //   - Then override `version` with the on-disk numeric value (or fall
      //     back to STATE_VERSION when absent / non-numeric) using
      //     `Number.isFinite`. The override pins `version` to the disk value so
      //     the downstream writeEnvelope guard can detect a future-schema
      //     envelope and refuse to downgrade it.
      //   - The `version: onDiskVersion` override anchors the return shape
      //     to Envelope (`version: number` is the one required field); the
      //     spread already carries the known subtree fields through when present
      //     on disk, and absent fields stay absent.
      //   - Subtree coercers (coerceSettings / coerceMute / coerceStats) still
      //     strip unknown sub-keys downstream — forward-compat is top-level ONLY.
      //   - Do NOT revert to a pick-only-known-keys return shape; that breaks the
      //     forward-compat contract and the "preserves on-disk version" test.
      const p = parsed as Record<string, unknown>
      const onDiskVersion =
        typeof p.version === 'number' && Number.isFinite(p.version)
          ? p.version
          : STATE_VERSION
      // Route every on-disk read through the explicit migration seam so the
      // migrate-on-read contract is structurally present and testable.
      return migrateEnvelope({ ...p, version: onDiskVersion }, onDiskVersion)
    }
    return { ...EMPTY_ENVELOPE }
  } catch {
    // Read failures silent (corrupt JSON, throwing getItem in Safari ITP).
    return { ...EMPTY_ENVELOPE }
  }
}

export function writeEnvelope(env: Envelope, deps: StorageDeps = {}): void {
  const storage = deps.storage ?? window.localStorage
  try {
    // Cross-tab downgrade guard: if another tab running a NEWER build wrote a
    // future-schema envelope, refuse to overwrite it with this older build's
    // data (which would corrupt the newer tab's next read). Best-effort, not
    // transactional — a residual TOCTOU window between the inner getItem and the
    // outer setItem remains; closing it needs the Web Locks API (deferred).
    //
    // The inner re-read MUST be fail-open in its own try/catch: if getItem throws
    // (Safari ITP / private mode) assume STATE_VERSION and still write, rather
    // than letting the outer catch swallow the whole write.
    let currentVersion: number = STATE_VERSION
    try {
      const raw = storage.getItem(STATE_KEY)
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const v = (parsed as Record<string, unknown>).version
          if (typeof v === 'number' && Number.isFinite(v)) currentVersion = v
        }
      }
    } catch {
      // Treat throw/corrupt as "no version info"; proceed with write.
    }
    if (currentVersion > STATE_VERSION) {
      // DEV-only signal so developers can spot a downgrade-after-upgrade.
      if (import.meta.env.DEV) {
        console.warn(
          `[storage] refusing to overwrite on-disk envelope v${String(currentVersion)} ` +
          `(this build is v${String(STATE_VERSION)}). Writes are silently discarded — ` +
          `reload the newer build or clear localStorage.`,
        )
      }
      return
    }
    // Stamp STATE_VERSION on every successful write. Caller-passed `env.version`
    // is structurally ignored (the spread is overridden by the explicit key).
    const payload = JSON.stringify({ ...env, version: STATE_VERSION })
    storage.setItem(STATE_KEY, payload)
  } catch {
    // Write failures silent (quota, ITP, private mode).
  }
}
