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

---

# Decision — Stretch completion holds the final cycle (2026-06-20)

Source: `/ds-debug` — operator reported the Stretch end screen/sound firing at
countdown-zero, cutting the last In/Out (HRV already holds it).

## SC-1 — Hold Stretch completion to the end of the in-progress cool-down cycle

**Q:** Stretch fired `isComplete` and the end chord at `finalSegment.endSec` (the
exact requested total — a deliberately PARTIAL final cycle), so the last breath was
cut mid-exhale at 0:00. HRV rounds completion up to the cycle via `getCompletionSec`.
Match HRV, or keep the exact-total cutoff?

**Decision:** Match HRV. Added `getStretchCompletionSec(segments)` = the cool-down's
partial `endSec` rounded UP to the next whole cool-down cycle. `getStretchFrame`
keys `isComplete` and its clamp ceiling off it (the orb advances through the final
exhale), and `resolveTargetSec` uses it so cues + end chord fire at the true cycle
end. `remainingSec` and the displayed Duration (`computeStretchTotalSec` = `endSec`)
are unchanged — the countdown still reaches 0:00 at the requested total.

**Supersedes:** the "realized session total equals the requested whole-minute total
exactly" property (plan 34-10 / UAT GAP-1, and SPEC.md D-5/FR-6 "displayed Duration
equals the real session length"). The *displayed* total still equals the request;
the session now ends up to one cool-down breath cycle (60/targetBpm seconds) later to
finish the breath — exactly as HRV already runs past its displayed duration. The
segment table itself is unchanged (`endSec` still == requested total), so
`buildStretchSegments` / `computeStretchTotalSec` and their docstrings remain accurate.

**Rationale:** Cross-practice consistency — a guided breath should never be cut
mid-exhale. The sub-cycle overrun is the same accepted behavior HRV ships.

---

# Feature: Native desktop apps via Pake — grilling 2026-06-20

Source: `/ds-explore --web` (`.project/EXPLORE.md`) → `/ds-grill-me`. Goal: ship
downloadable native desktop builds (Pake = Tauri shell wrapping the live PWA at
`https://lucindo.github.io/hrv/`), automated in CI, public downloads. No prior
desktop/distribution decisions existed. Implementation on branch
`feat/desktop-pake`.

Key framing the decisions rest on: the Pake wrapper loads the **live URL**, so
the web app auto-updates inside an installed desktop app regardless of binary
version. The binary only changes when wrapper config changes (icon, size, name,
Pake/Tauri bump) — so desktop releases are rare and genuinely independent of web
releases.

## DA1 — Integration shape

**Q:** Build via Pake's own hosted Action and publish by hand (A), a dedicated
workflow in this repo → GitHub Release (B), or couple desktop into the existing
`vX.Y` web-release pipeline (C)?

**Decision:** B, preceded by a one-off A smoke test (a local `pake … --icon`
re-run on the Mac to validate the icon fix before any CI lands).

**Rationale:** B is the only option giving repeatable, public, automated
downloads without endangering the delicate `deploy.yml` (loop-guard / `[skip ci]`
commit-back). C couples two release cadences that don't move together and bolts
slow Rust builds onto a currently-fast deploy. The A smoke test de-risks the
known icon gap cheaply.

## DA2 — Platforms

**Q:** macOS, Windows, Linux — which now?

**Decision:** macOS + Windows now. Linux deferred.

**Rationale:** mac+win covers the overwhelming majority of desktop users and
keeps the first workflow simple/green. Linux is the only leg with real cost
(Tauri system deps + deb/appimage/rpm/zst format sprawl) and is a trivial matrix
addition later if a Linux user asks.

## DA3 — macOS architecture

**Q:** Universal (`--multi-arch`, Intel+ARM) or Apple-silicon-only?

**Decision:** Universal.

**Rationale:** Build-time cost is invisible (infrequent per-release build); the
benefit is zero "won't open on my Intel Mac" reports.

## DA4 — Signing & notarization

**Q:** Ship unsigned with a documented workaround, or pay for Apple Developer ID
($99/yr) + Windows cert and notarize in CI?

**Decision:** Unsigned + documented first-launch workaround (macOS
`xattr -dr com.apple.quarantine "/Applications/HRV Breathing.app"` /
right-click→Open; Windows SmartScreen *More info → Run anyway*).

**Rationale:** For a free, no-backend, no-revenue app, $99+/yr plus cert/secret
plumbing isn't justified by the prompt-friction it removes. A two-line README
note handles it; signing stays a later upgrade.

## DA5 — Trigger & versioning

**Q:** Manual dispatch only, a separate `desktop-v*` tag, or coupled to `vX.Y`?
Does `--app-version` track `package.json`?

**Decision:** `push: tags: desktop-v*` publishes the GitHub Release;
`workflow_dispatch` is test-only (artifacts/draft, no public release).
`--app-version` read from `package.json.version` at build time.

**Rationale:** Fully decoupled from the `vX.Y` Pages tags → zero risk to
`deploy.yml`. Single source of truth for version; desktop releases are rare so a
separate counter isn't worth it.

## DA6 — Icon source

**Q:** Which master asset → per-platform icons?

**Decision:** `--icon public/pwa-512x512.png`; let pake-cli convert to
`.icns`/`.ico`. Padded macOS-squircle variant deferred as polish.

**Rationale:** Already in-repo (checked out by the workflow), deterministic, no
network, and the same icon the PWA installs with — single source of truth. The
earlier "icon missing" was just from omitting `--icon` (failed favicon
auto-fetch).

## DA7 — Window chrome

**Q:** Lock the test config? Add a min size?

**Decision:** `--width 630 --height 900 --hide-title-bar`, no min-size.

**Rationale:** The operator's validated config. The app is a mobile-first
responsive PWA, so a small window reflows rather than breaks — a min-size guard
isn't earned. `--hide-title-bar` is macOS-only; Windows shows a standard title
bar (expected).

## DA8 — Download surfacing & release mode

**Q:** Where do users find downloads, and draft vs auto-publish?

**Decision:** README "Download" section linking to `…/releases/latest`;
`desktop-v*` tag auto-publishes the Release. No in-app / Pages-site download link
in scope now.

**Rationale:** `releases/latest` is a stable URL needing no per-version edits.
The tag is the deliberate publish act. A Pages-site link touches locked-copy +
i18n (EN/PT-BR) and design/copy review — a separate deliberate change, not a
freebie to bundle here.

## DA9 — pake-cli version

**Q:** Pin an exact `pake-cli` version or float `@latest`?

**Decision:** Pin exact `pake-cli@x.y.z` (version resolved when writing the
workflow).

**Rationale:** Reproducible builds; a Pake/Tauri release can't silently break or
change the output of a build we run infrequently. Bumping the pin is a deliberate
one-line change.

## DA10 — Release asset names

**Q:** Keep Pake's default `HRV Breathing.dmg`/`.msi` or rename on upload?

**Decision:** Rename on upload to
`HRV-Breathing-<version>-macos-universal.dmg` and
`HRV-Breathing-<version>-windows-x64.msi` (version from `package.json`). In-app
name stays "HRV Breathing".

**Rationale:** Clean download URLs (no `%20`), self-describing filenames.

## Open implementation risks (resolve while building, not decisions)

- Resolve the current stable `pake-cli` version to pin (DA9).
- macOS universal may need `rustup target add x86_64-apple-darwin` before
  `--multi-arch`.
- Confirm `.icns`/`.ico` conversion quality from the 512 png — the DA1 smoke test
  covers this.
