# Specification: Stretch — shorter phase minimums + target ratio

## Problem

The Stretch practice guides a breath-rate walk-down across three phases — Warm-up
(hold at start BPM), Ramp (linear BPM step-down), Cool-down (hold at target BPM).
Today every phase has a 5-minute floor, forcing a ≥15-minute session, and the
breath ratio (inhale:exhale split) is a single fixed value for the whole session.
Two practitioners' needs go unmet: shorter sessions (a ~6-minute total), and
stretching the *ratio* over the session the same way the BPM is stretched (start
balanced, end exhale-weighted). This spec covers both for the Stretch practice
only — HRV/Resonant and Navi Kriya are untouched.

## Scope

In scope:
- Replace each phase's duration option set so the minimum is 2 min (see FR-1..3
  for the exact sets), all defaulting to 5 min.
- Add a `targetRatio` to Stretch settings (default = start ratio). The inhale/
  exhale split holds the start ratio through Warm-up, interpolates continuously
  across the Ramp, and holds the target ratio through Cool-down — the exact
  parallel to the existing BPM step-down.
- The Stretch settings form, domain model, validation, and storage coercion needed
  for the above, plus stretch-specific label strings.

Out of scope:
- Any change to HRV/Resonant (`SessionSettings`) or Navi Kriya practices.
- Changing the BPM ramp algorithm, segment-snapping strategy, the short-ramp
  overshoot behavior (accepted as-is — see Decisions), or the two session engines.
- A ratio schedule independent of the Warm-up/Ramp/Cool-down structure.
- SetupCard changes (the Stretch card never showed ratio) and visual-guide changes
  (it already consumes per-frame `currentInhaleSec`/`currentExhaleSec`).

## Users

- **Practitioner (Stretch)** — configures and runs a Stretch session. Needs phase
  durations as short as 2 minutes, and optionally a target ratio so the breath
  lengthens the exhale (or shifts balance) over the session. Leaving the target
  ratio at its default changes nothing about their existing sessions.

## Decisions (resolved)

- D-1 (transition model): Continuous interpolation of the inhale fraction across
  the Ramp, spread **evenly across ramp steps** (parallel to the BPM step-down,
  shared `numSteps`). Warm-up holds start; cool-down holds target.
- D-2 (field naming): Keep `ratio` as the start field; add `targetRatio`. No
  rename, no storage migration of the existing key.
- D-3 (option sets): Replace each phase's options with the explicit sets in
  FR-1..3 (not merely "add 2"); all default 5.
- D-4 (removed-value migration): A persisted phase value no longer in its option
  set (Warm-up `15`; Ramp `15`/`20`) coerces to the default `5` via the existing
  per-field `isValid ? v : DEFAULT` pattern — no snap helper.
- D-5 (overshoot): A short Ramp with a wide BPM span / slow target may inflate the
  realized total past the nominal phase sum. Accepted, no guard — the table stays
  valid and the displayed Duration reflects the real total.
- D-6 (UI): Form order becomes Start BPM · Start Ratio · Target BPM · Target Ratio
  · Warm-up · Ramp · Cool-down · Duration. Labels: rename stretch `initialBpmLabel`
  → "Start BPM"; add stretch-specific "Start Ratio" + "Target Ratio" strings. The
  shared `ratioLabel` ("Ratio", used by Resonant) is NOT mutated.

## Functional Requirements

Phase minimums:
- FR-1: The Warm-up duration options SHALL be exactly `[2, 3, 4, 5, 10]` minutes,
  default `5`.
- FR-2: The Ramp duration options SHALL be exactly `[2, 3, 4, 5, 10]` minutes,
  default `5`.
- FR-3: The Cool-down duration options SHALL be exactly
  `[2, 3, 4, 5, 10, 15, 20, 25, 30, 'open-ended']`, default `5`.
- FR-4: A persisted phase-duration value not in its new option set (Warm-up `15`;
  Ramp `15`/`20`) SHALL coerce to the default `5`; a persisted value still present
  in its set (e.g. Cool-down `15`/`20`) SHALL be preserved.
- FR-5: A Stretch session built entirely from 2-minute phases SHALL produce a
  valid, monotonic segment table and complete correctly (no crash, no NaN/Infinity
  span; BPM steps land only on Out→In boundaries).
- FR-6: When the Ramp overshoots its requested span (short ramp, wide BPM span),
  the segment table SHALL remain valid and `computeStretchTotalSec` SHALL return
  the realized total (the displayed Duration equals the real session length).

Target ratio:
- FR-7: `StretchSettings` SHALL carry a `targetRatio: RatioLabel` field; `ratio`
  remains the start ratio.
- FR-8: `DEFAULT_STRETCH_SETTINGS.targetRatio` SHALL equal the default start
  `ratio`.
- FR-9: When `targetRatio` equals the start `ratio`, `buildStretchSegments` output
  (per-segment inhale/exhale, total) SHALL be identical to the pre-change output
  for the same other settings.
- FR-10: When `targetRatio` differs from `ratio`, the inhale fraction SHALL hold
  the start ratio through Warm-up, step linearly across the Ramp using the same
  `numSteps` as the BPM walk (ramp step `i` inhale% =
  `startInhale% − i · (startInhale% − targetInhale%) / numSteps`), and hold the
  target ratio through Cool-down.
- FR-11: `targetRatio` SHALL accept any valid `RatioLabel` regardless of its
  relation to `ratio` (more, less, or equal inhale weight) — no ordering
  constraint, unlike `targetBpm`.
- FR-12: `validateStretchSettings` SHALL throw `RangeError` when `targetRatio` is
  not a valid `RatioLabel`.
- FR-13: `coerceStretchSettings` SHALL fall back a missing/invalid persisted
  `targetRatio` to the slice's coerced start `ratio` (non-throwing, per-field).

UI:
- FR-14: The Stretch settings form SHALL render rows in the order Start BPM ·
  Start Ratio · Target BPM · Target Ratio · Warm-up · Ramp · Cool-down · Duration.
- FR-15: The form SHALL expose a Target Ratio control (a `SettingsSegmentedRow`
  over `RATIO_OPTIONS`) and SHALL label the start-ratio row "Start Ratio".
- FR-16: New stretch label strings SHALL be added for EN and pt-BR without
  mutating the shared `ratioLabel`.

## Non-Functional Requirements

- NFR-1: Performance — no per-frame cost change; the segment table is still built
  once at session start, no new rAF-path allocation.
- NFR-2: Scale — N/A (single-user, client-only, no backend).
- NFR-3: Availability — N/A (static PWA).
- NFR-4: Data retention — settings persist in `localStorage` on-device only;
  `targetRatio` is added to the existing per-practice `stretch` slice additively,
  no envelope-version bump, self-healing on read.

## Interfaces

- Domain (`src/domain/settings.ts`): `WARMUP_MINUTES_OPTIONS`,
  `RAMP_DURATION_OPTIONS`, `COOLDOWN_OPTIONS` replaced per FR-1..3; `WarmUpMinutes`
  + `CoolDownMinutes` unions updated; `StretchSettings` gains `targetRatio`;
  `DEFAULT_STRETCH_SETTINGS` gains `targetRatio`; `validateStretchSettings` checks
  it.
- Domain (`src/domain/stretchRamp.ts`): `buildStretchSegments` reads `ratio` +
  `targetRatio` and assigns per-segment inhale/exhale splits (warm-up = start, ramp
  = interpolated by step index, cool-down = target).
- Storage (`src/storage/practices.ts`): `coerceStretchSettings` coerces
  `targetRatio`; removed phase values fall back to default per FR-4.
- UI (`src/components/StretchSettingsForm.tsx`): reordered rows + new Target Ratio
  `SettingsSegmentedRow`; start-ratio row relabeled.
- Content (`src/content/strings.ts`): stretch-specific Start BPM / Start Ratio /
  Target Ratio labels (EN + pt-BR); shared `ratioLabel` untouched.
- No external systems; the only boundary data change is the additive `targetRatio`
  key.

## Constraints

- Language/runtime: TypeScript 5+/strict, React 19, browser-only (Technical
  Profile).
- The two session engines stay separate; this touches only the Stretch domain/
  segment table and breathing-side consumers — not `useNKEngine`.
- No `any`; validate at the storage boundary (non-throwing coercer) and the domain
  boundary (throwing validator).
- Additive persistence only — no envelope-version bump, no destructive migration of
  the existing `stretch` slice beyond the per-field fallbacks in FR-4/FR-13.
- Do not mutate the shared `ratioLabel` string (Resonant depends on it).
- Honor `prefers-reduced-motion`; the guide already consumes per-frame
  inhale/exhale seconds, so a transitioning ratio needs no guide changes.

## Technical Profile

- Primary language: TypeScript `~6.0.2`, `strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- Runtime target: modern browsers (PWA); Vite 8 build, Tailwind v4.
- Build toolchain: `npm run build` (`tsc -b` + Vite), `npm run lint` (ESLint 10).
- Testing: Vitest 4 + Testing Library + jsdom; tests colocated next to source.

## Acceptance Criteria

- AC-1: The Stretch form lists Warm-up `[2,3,4,5,10]`, Ramp `[2,3,4,5,10]`, and
  Cool-down `[2,3,4,5,10,15,20,25,30,open-ended]`, each defaulting to 5.
- AC-2: A session with all three phases at 2 minutes and a valid down-ramp runs to
  completion without error and yields a sane finite total.
- AC-3: A persisted slice with `warmUpMinutes: 15` coerces `warmUpMinutes` to `5`;
  a persisted `coolDownMinutes: 20` is preserved as `20`.
- AC-4: A persisted slice with no `targetRatio` loads with `targetRatio` equal to
  its coerced start `ratio`, and durations preserved/coerced per AC-3.
- AC-5: With `targetRatio` equal to start `ratio`, `buildStretchSegments` output
  equals the pre-change output for the same other settings.
- AC-6: With start `ratio` 50:50 and `targetRatio` 20:80, sampled frames show
  inhale ≈50% during Warm-up, monotonically shifting toward ≈20% across the Ramp by
  step index, and ≈20% during Cool-down.
- AC-7: A `targetRatio` more inhale-weighted than start (e.g. start 20:80, target
  50:50) validates and runs without an ordering error.
- AC-8: `validateStretchSettings` throws `RangeError` on an invalid `targetRatio`.
- AC-9: A tampered persisted `targetRatio: "garbage"` coerces to the coerced start
  `ratio`, with the rest of the slice preserved.
- AC-10: Selecting a Target Ratio in the form persists it to the `stretch` slice
  and it survives reload.
- AC-11: The form renders rows in the order Start BPM · Start Ratio · Target BPM ·
  Target Ratio · Warm-up · Ramp · Cool-down · Duration; the Resonant form's "Ratio"
  label is unchanged.
- AC-12: A short Ramp with a wide BPM span / slow target produces a valid table,
  and the displayed Duration equals the realized session length.

Coverage:
- FR-1 → AC-1
- FR-2 → AC-1
- FR-3 → AC-1
- FR-4 → AC-3
- FR-5 → AC-2
- FR-6 → AC-12
- FR-7 → AC-5, AC-10
- FR-8 → AC-4
- FR-9 → AC-5
- FR-10 → AC-6
- FR-11 → AC-7
- FR-12 → AC-8
- FR-13 → AC-4, AC-9
- FR-14 → AC-11
- FR-15 → AC-10, AC-11
- FR-16 → AC-11

## Open Questions

- None blocking. pt-BR copy for the new labels to be proposed at implementation and
  confirmed by the operator.
