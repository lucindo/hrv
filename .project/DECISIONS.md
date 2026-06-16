# Decisions — SSOT cleanup grill (2026-06-13)

Source: `/ds-code-review` full-repo findings, grilled item by item. Disposition
for each: **fix now** / **fix later** / **won't fix**. Implementation happens on
branch `refactor/ssot-cleanup` after the interview.

---

## D1 — Dead legacy stats API in `src/storage/stats.ts`

**Q:** `recordSession`, `resetStats`, `loadStats` have zero production callers
(only `stats.test.ts` + a blanket barrel re-export); the per-practice API in
`practices.ts` superseded them. Delete, keep, or other?

**Decision:** Delete all three. Drop the tests pinned to the dead functions, but
retarget the still-relevant coverage (fractional-timestamp coercion,
round-trip invariant) to `coerceStats`, which `practices.ts` still uses. Keep
`coerceStats` / `COUNT_THRESHOLD_MS` / `ZERO_STATS` / `PersistedStats`.

**Rationale:** Dissolves the "duplicate implementation" finding at the root —
one live implementation remains, so no shared helper is needed. The coercion
behavior that still matters is exercised through `coerceStats`, so coverage
moves there rather than disappearing.

---

## D2 — Overlapping number validators in `stats.ts:37-64`

**Q:** Five predicates repeat the `typeof v === 'number' && Number.isFinite(v)
&& v >= 0` literal. Compose, leave as-is, or introduce generic combinators?

**Decision:** Compose. Keep all four named predicates (so the int-vs-float
asymmetry comments stay attached to named functions), but implement them in
terms of a single base check so the literal exists once. No generic
`nullableOf()` HOF.

**Rationale:** Removes the one duplicated literal without adding abstraction
beyond the two callers. Named predicates preserve the load-bearing rationale
comments.

---

## D3 — `LearnAnchor` ↔ `SettingsAnchor` duplicate chrome

**Q:** The two top-bar anchors are byte-identical but for the SVG glyph and two
aria strings. Extract a shared component, collapse the wrappers, or won't fix?
(`IconButton` primitive rejected — it uses native `disabled` + shadow + size-8/10;
the anchors deliberately use `aria-disabled` + no-op click + bordered size-9.)

**Decision:** Extract a shared `IconAnchor` (props: `disabled`, `onClick`,
`label`, `disabledLabel`, `children`) holding the chrome once. Keep
`LearnAnchor`/`SettingsAnchor` as thin wrappers passing their glyph + strings.

**Rationale:** Kills the real drift risk — the focus-ring/disabled/chrome
classes are currently hand-synced across both files. Thin wrappers preserve the
existing prop APIs and tests.

---

## D4 — `LearnPanel` local `SectionCard` vs `primitives/SectionCard`

**Q:** Both files carry comments stating they were intentionally kept separate,
but the only difference is `LearnPanel` hardcodes `padding: '16px 18px'` instead
of taking the prop. Consolidate (overriding the documented decision) or honor it?

**Decision:** Consolidate onto the primitive. Replace the local `SectionCard`
with a one-line local delegate `Card` that calls
`<SectionCard padding="16px 18px">`. Delete the now-stale "intentionally NOT
consolidated" comments on both files.

**Rationale:** The "different signature" rationale is circular — the primitive
is a strict superset. Chrome (border/bg/radius) should live in one place.
Renders identically.

---

## D5 — `formatOmLength` duplicated (`setupCardSummary.ts:78` ↔ `NaviKriyaSettingsForm.tsx:30`)

**Q:** Same `OmLength → localized label` mapping in two files. Extract to a
shared content-layer helper, or leave?

**Decision:** Won't fix.

**Rationale:** Most marginal item on the list — a 3-line map over a stable
3-value enum, near-zero drift risk. Not worth a new shared export. Components
can't import the natural `app/practiceCopy.ts` home anyway (layering), and
moving copy helpers to the content layer is out of scope.

---

## D6 — `SettingsFormShell` pass-through wrapper

**Q:** It renders `<div className="w-full" aria-label>{children}</div>` for the
three settings forms. Inline it (flagged as slop) or keep?

**Decision:** Keep. Won't fix.

**Rationale:** Not slop — it's the single source for the form-region wrapper.
Inlining would duplicate the `className` + `aria-label` across three forms,
which is the opposite of SSOT. Matches the project's componentized style.

---

## D7 — Repeated disconnect bodies in `nkCueSynth.ts`

**Q:** The 4-line try/catch disconnect body repeats verbatim across 3 `'ended'`
handlers + 2 single-tone `cancel()` tails. Extract a helper or keep inline?

**Decision:** Extract a local `disconnectToneNodes(t)` helper within
`nkCueSynth.ts`; apply to the 3 `'ended'` handlers and the 2 single-tone
`cancel()` tails. Preserve the idempotent try/catch posture. The end-chord
`cancel()` (voice arrays, different shape) stays as-is. Do NOT cross-dedup with
`cueSynth.ts` — the synths are intentionally independent.

**Rationale:** Behavior-preserving in-file dedup; doesn't touch the engine
split or couple the two synths.

---

## D8 — Thin view-model builders in `appViewModel.ts`

**Q:** `createInstallViewModel` / `createNaviAudioToggleViewModel` are small.
Inline into `useAppViewModel` or keep?

**Decision:** Keep. Won't fix.

**Rationale:** They follow the file's established `createXViewModel` factory
pattern, each derives at least one value (`installable`, `needsResume: false`
with load-bearing comment), and they're independently testable. Inlining would
scatter derivation into the hook and break the convention.

---

## D9 — Mutually-exclusive `returningFrom*` flags + repeated setState in `useAppNavigation`

**Q:** `returningFromAdvanced` / `returningFromStats` are never both true and are
always set together; every nav callback repeats a triple-`setState`. Collapse to
a discriminated union, dedup internally only, or won't fix?

**Decision:** Full fix. Collapse the two booleans into a single
`returningFrom: 'advanced' | 'stats' | null` discriminator; introduce a
`goTo(screen, returningFrom?)` helper to replace the repeated triple-`setState`.
Update the ripple: `AppNavigation` interface (`appViewModel.ts`), `ScreenRouter`
props, `AppSettingsPage` signature + focus-restore effect + its dep array.

**Rationale:** Exactly the "discriminated unions over boolean flags" rule from
the project's TS profile. Eliminates both the repetition AND the impossible
"both-true" state. Largest change on the list (4 files + a focus effect) — lean
on existing `AppSettingsPage` tests to confirm focus restoration is preserved.

---

## D10 — Repeated Tailwind utility clusters across components

**Q:** focus-ring / hover-bg / disabled-state class clusters repeat across many
buttons. Hoist to shared constants/`@utility`, or leave inline?

**Decision:** Won't fix.

**Rationale:** Design-token territory. Hoisting Tailwind class strings into TS
constants is design-locking (anchors downstream-modifiable values, kills
per-component tweakability) — against the project's working rules. Inline
utilities are the intentional style. If a true single source is ever wanted, the
correct home is a Tailwind `@utility` layer in `theme.css` (a deliberate design
decision, not a mechanical refactor).

---

## D11 — Duplicated structural audio constants across the two synths

**Q:** `cueSynth.ts` and `nkCueSynth.ts` each define byte-identical
`STRIKE_RAMP_OFFSET = 0.005`, `CLEANUP_PADDING_SEC = 0.2`,
`NEAR_SILENCE = 0.0001`. Share them or keep independent? (Revised from the
initial review's "report-only, don't fix.")

**Decision:** Extract the three to a new `src/audio/audioConstants.ts`; import in
both synths. Leave all feel-tuning constants (gains, durations, decay taus)
local and independent. Keep `STRIKE_RAMP_OFFSET` as its own name — do NOT fold
into `audioEngine.SAFE_LEAD_SEC` (equal value, distinct concept).

**Rationale:** These are structural Web Audio constants (physics floor / GC
margin / ramp lead), not feel-tuning — identical by physics, real drift risk.
Sharing them does not violate the engine-split rule, which governs the
rAF-vs-setTimeout schedulers, not numeric floors. A dedicated module avoids
synth-to-synth import coupling.

---

## D12 — `storage.ts` inline zero-stats migration literal

**Q:** The v2→v3 migration seeds an inline `{ totalSessions: 0, ... }` literal
that mirrors `ZERO_STATS`. Restructure to dedup, or keep?

**Decision:** Won't fix.

**Rationale:** Documented, justified circular-dep duplication (`stats.ts`
imports `asRecord` from `storage.ts`, so `storage.ts` can't import `ZERO_STATS`
back — still true after D1). It's a frozen-in-time migration seed; a v3
migration should emit the v3 shape, not chase future `ZERO_STATS` edits.

---

## Summary — implementation order

**Fix now (on `refactor/ssot-cleanup`):**
- D1 — delete dead `recordSession`/`resetStats`/`loadStats`; retarget coercion
  coverage to `coerceStats`; tighten barrel.
- D2 — compose the four number validators over one base check.
- D3 — extract shared `IconAnchor`; `LearnAnchor`/`SettingsAnchor` become thin wrappers.
- D4 — `LearnPanel` uses `primitives/SectionCard` via a one-line `Card` delegate;
  delete stale "not consolidated" comments.
- D7 — extract local `disconnectToneNodes(t)` in `nkCueSynth.ts`.
- D9 — collapse `returningFrom*` booleans into a `returningFrom` union + `goTo` helper (4-file ripple).
- D11 — extract `STRIKE_RAMP_OFFSET`/`CLEANUP_PADDING_SEC`/`NEAR_SILENCE` to `src/audio/audioConstants.ts`.

**Already done:** `ModalDialogShell` deleted (commit `8d70570`).

**Won't fix:** D5 (formatOmLength), D6 (SettingsFormShell), D8 (view-model
builders), D10 (Tailwind clusters), D12 (migration literal).

Suggested commit sequence: D2 → D1 → D3 → D4 → D7 → D11 → D9 (largest/last),
one logical commit each; `npm run test:run` + `npm run build` green before each.

---

# Feature: Advanced precise-control (free-set velocity & ratio) — grilling 2026-06-16

Advanced users want finer control than the fixed pickers allow: HRV BPM is
locked to 0.5 steps, Navi to 3 discrete speeds, ratio to 4 discrete splits.
Goal: an opt-in way to set these freely within bounds.

## Q1 — Toggle granularity
**A — one global "Advanced / precise control" toggle.** When on, swaps all three
fixed pickers (HRV BPM, Navi velocity, ratio) for sliders app-wide.
Rationale: one mental model, one persisted bool, minimal UI/schema sprawl;
matches the "one advanced toggle" framing.

## Q2 — HRV BPM slider bounds & granularity
Bounds **1.0–7.0** (keep existing physiologically-sane envelope). Slider is
**continuous** (store the raw float, e.g. 3.3478); only the **label is rounded**
(~2 decimals, trim trailing zeros: `3.5`, `3.35`, `4`). Keep **+/− nudge buttons**
for fine stepping. Engine already accepts any float via `60/bpm`.
Rationale: continuous = no artificial grid; rounding lives in the view only.

## Q3 — Navi velocity slider bounds & unit
Bounds **1.0–4.0 s per OM**, continuous, label rounded (~2 dec), keep **+/− nudges**.
Unit = **seconds per OM (A)**, right = slower — honest to the data model, no
inversion layer. Existing fast/medium/slow (1.75/2.16/3.0) sit inside the range
so discrete↔free is smooth. Engine must consume raw seconds (bypass NK_OM_SECONDS map).

## Q4 — Inhale/exhale ratio slider bounds
Hard constraint: **exhale >= inhale always** → inhale capped at 50% (`50:50`).
Headroom only downward (fast inhale / slow exhale). Bounds **inhale 10–50%**
(`10:90` … `50:50`), continuous, +/− nudges (1%). Label = `i:e` integer form
(`35:65`). Store inhale fraction; exhale = 100 − inhale. Floor held at 10%
(sub-10% inhale gets vanishingly short at low BPM); revisit to 5% only if asked.

## Q5 — Stretch practice scope
**A — include Stretch.** Global advanced toggle also frees Stretch's start/target
BPM and start/target ratio sliders. Must preserve constraints: `targetBpm <
initialBpm`, ratio cap (exhale >= inhale), and grid-snap tolerance for arbitrary
BPM (phase-boundary alignment in stretchRamp must accept free values).

## Q6 — Toggle-off behavior (free → discrete)
**A — snap to nearest discrete on toggle-off.** 3.35→3.5, 1.4s→fast. One source
of truth per field, picker always valid, no ghost/hidden values. Cost (exact
free value lost on round-trip) is minor and predictable.

## Q7 — Data model for free values
**A — collapse coded fields to plain numbers** (single source of truth):
- `omLength: 'fast'|'medium'|'slow'` → `omSeconds: number`; presets {1.75,2.16,3.0};
  engine reads omSeconds directly (drop NK_OM_SECONDS map lookup at engine).
- `ratio: '50:50'|…` → `inhaleShare: number` (10–50); presets {50,40,30,20};
  breathingPlan derives inhale/exhale; same for Stretch start/target.
- HRV `bpm` already number — just widen validator (array-membership → range 1–7).
- Discrete-ness becomes UI concern (preset list) + Q6 snap. Validators → range checks.
- Requires **v3→v4 migration** (label→number) across resonant/stretch/naviKriya.
Rejected B (parallel free fields) — reintroduces dual source of truth the
D1–D12 SSOT cleanup just removed.

## Q8 — Advanced toggle location & default
Global pref `prefs.advanced: boolean`, default **false** (opt-in). Toggle lives
in the **Settings panel → Advanced settings → Behavior block**.

## Q9 — Slider primitive & nudge steps
Build new `SettingsSlider` primitive matching `SettingsStepper` idiom: continuous
native `<input type="range" step="any">` + `[−] … [+]` nudge buttons (reuse
stepper button styling), rounded display label, full keyboard/aria. Nudge deltas:
HRV BPM **0.05**, Navi **0.05 s**, ratio **1%** inhale share. Drag = continuous.

## Q10 — Stretch BPM crossing constraint
**A — dynamic bounds.** Target slider max = `initialBpm − 0.05`; initial slider
min = `targetBpm + 0.05`. Sliders can't cross; "strictly less" honored by the
0.05 gap. No clamp-and-push (avoids spooky untouched-value moves). Start/target
ratio sliders need no ordering — each just obeys inhale ≤ 50 cap (Q4).

## Q11 — Migration & coercion (v3 → v4)
Bump envelope version 3→4.
Migrate: ratio label → `inhaleShare` (50:50→50…20:80→20); `omLength` →
`omSeconds` (fast→1.75, medium→2.16, slow→3.0); stretch start/target ratio
labels → inhaleShare; bpm unchanged; `prefs.advanced` default false on read.
Coerce (per-field, non-throwing, like frontCount-snap):
- advanced ON  → range-clamp (HRV 1–7, Navi 1–4s, inhale 10–50).
- advanced OFF → snap to nearest preset (keeps "advanced off ⇒ legal discrete").
Coerce reads prefs.advanced (migrate layer holds whole envelope).

## Resolved plan — summary & implementation order

One global `prefs.advanced` toggle (Settings → Advanced → Behavior, default off)
swaps fixed pickers for continuous sliders across HRV, Stretch, and Navi. The
underlying model collapses to plain bounded numbers; discrete presets become a
UI view + a snap-on-toggle-off invariant.

Bounds / units:
- HRV BPM 1.0–7.0, nudge 0.05, label ~2-dec trimmed.
- Navi `omSeconds` 1.0–4.0 s/OM (right = slower), nudge 0.05 s.
- Ratio `inhaleShare` 10–50% (exhale ≥ inhale, hard cap 50), nudge 1%, `i:e` label.
- Stretch: same sliders; target/initial BPM can't cross (dynamic bounds, 0.05 gap).

Implementation order (each a self-contained commit; suite + build green between):
1. Domain: `omLength`→`omSeconds`, `ratio`→`inhaleShare`; widen validators to
   range; presets as UI lists. Update breathingPlan / NK engine / stretchRamp to
   read numbers.  → verify: domain + engine tests pass.
2. Storage: v3→v4 migration (label→number) + advanced-aware coerce (snap vs
   clamp); `prefs.advanced` read with default.  → verify: migration tests.
3. `SettingsSlider` primitive (continuous range + nudge buttons, aria).
   → verify: component behavior test.
4. Wire forms: advanced flag swaps stepper/segmented ↔ slider per control;
   Stretch dynamic BPM bounds.  → verify: form tests both modes.
5. Advanced toggle in Settings → Behavior block.  → verify: toggle persists,
   round-trips, snap-on-off works end to end.

Non-decision follow-ups (content/impl, not design): new i18n strings for toggle
+ slider aria labels (all locales); confirm stats pass numbers through unchanged.
