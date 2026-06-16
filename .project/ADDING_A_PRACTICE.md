# Adding a new practice

A field guide for adding a 4th+ practice to the app, distilled from building the
experimental **KP** practice (inhale-hold-exhale, round-counted) on top of the
existing three: `resonant` (HRV), `stretch`, `naviKriya` (Navi).

The codebase makes this a **compiler-guided** exercise: add the id to the
`PracticeId` union and `tsc -b` enumerates almost every site you must touch
(exhaustive switches, `Record<PracticeId>` literals, view-model arms). Run
`npx tsc -b` early and often — it is the checklist.

---

## 0. Decide two things first

1. **Engine shape.** Pick the timing model that fits the mechanics — do NOT
   merge engines (they are deliberately separate, see CLAUDE-level notes):
   - **Continuous breath** (smooth in/out, duration-based) → rAF lookahead
     engine, like `useBreathingSessionController` + `useSessionEngine`. Used by
     resonant + stretch.
   - **Discrete / scripted** (counted steps, holds, scheduled cues, round-based)
     → setTimeout metronome, like `useNKEngine`. KP used this: a setTimeout
     scheduler for phase transitions + cues, plus a small rAF loop that only
     produces the orb's `SessionFrame` (smooth scale) — visual decoupled from
     timing.
2. **Visibility.** Shipping dark/experimental? Gate it behind a querystring
   feature flag (see §3). Otherwise it's always in the switcher.

---

## 1. Domain (`src/domain/`)

- New `xSettings.ts`: the settings `interface`, option arrays, `DEFAULT_X_SETTINGS`,
  `isValid*` predicates, and a `validateXSettings`. Reuse shared pieces
  (`RATIO_OPTIONS` / `RATIO_PARTS` / `isValidRatio` from `settings.ts`).
- New `xSession.ts` (if it has non-trivial timing): **pure** functions only
  (durations, schedules, derived values) — unit-test these in isolation. KP's
  `kpExhaleSec`, `kpTickOffsets`, `kpBreathDurations` live here.
- Export both from `src/domain/index.ts` (the barrel).

## 2. Storage (`src/storage/practices.ts`)

- Add the id to the **`PracticeId`** union and a slice to **`PracticeMap`**.
- Extend **`coerceActivePractice`** (the literal allow-list).
- Add **`coerceXSettings`** (per-field, non-throwing, `asRecord`-guarded — mirror
  `coerceNaviKriyaSettings`) and wire it into **`coercePractices`**.
- Add **`saveXSettings`** and (if it records sessions) **`recordXSession`**
  wrappers over `writeSliceSettings` / `recordPracticeSession`.
- No `STATE_VERSION` bump needed: a new slice is additive — old envelopes simply
  lack it and `coercePractices` fills the default on load.

## 3. Feature flag (only if experimental) (`src/featureFlags.ts`)

- Add a field to `FeatureFlags` + an `X_FLAG` spec. For a **personal/non-sticky**
  flag, resolve it **query-only** in `readFeatureFlags` (`... ?? X_FLAG.defaultValue`,
  never from `persisted`) and type the `persisted` param `Omit<FeatureFlags, 'x'>`.
  `useFeatureFlags.ts` needs no change if you keep it out of the persisted projection.
- Guard a stale persisted active practice in `useAppViewModel`: if the flag is off
  but the stored active practice is the gated id, fall back to `resonant` so the
  user can't get stuck on a hidden practice.

## 4. Strings + copy (`src/content/strings.ts`, `src/app/practiceCopy.ts`)

- `strings.practice.switcher`: add `xName` + `xHeading` (EN **and** pt-BR).
- Add an `xControls` block (form labels/units) and, if it has a custom readout,
  an `xReadout` block (EN + pt-BR).
- `practiceCopy.ts`: add the `case` in `getPracticeTitle` and the entry in
  `getPracticeToggleStrings`' `practiceNames` record.

## 5. Switcher (`src/components/PracticeToggle.tsx`, `PracticeScreen.tsx`)

- Add the inline SVG glyph branch in `PracticeGlyph`.
- Order is the `PRACTICE_IDS` array. For a flag-gated entry, append it
  conditionally (KP added a `kpEnabled` prop; `PracticeScreen` passes
  `vm.featureFlags.kp`).

## 6. View model (`src/app/appViewModel.ts` + `useAppViewModel.ts`)

In **`appViewModel.ts`** (mostly pure builders, unit-tested):
- Add arms to the `AppPracticeSessionViewModel` and `AppPracticeSettingsViewModel`
  unions (keep a distinct `kind` even if it reuses another's surface — the house
  style; a future divergence then surfaces as a missing arm).
- Add to `PracticeSettingsSources`, and arms in `createPracticeSessionViewModel`,
  `createPracticeSettingsViewModel`, `createPracticeControlsViewModel`.
- If it has its own end-session dialog, add the id to `AppEndSessionDialogViewModel`.
- If it has its own session surface, add a `XSessionViewState` interface + a
  `getXPresentation` / `getXPrimaryAction` in `sessionPresentation.ts`.

In **`useAppViewModel.ts`** (the orchestrator):
- Instantiate the controller hook; include its `sessionActive` in `controlsDisabled`.
- Feed its state into the session/settings/controls view-model inputs.
- Add its end-dialog entry; call its `clearCompletion` in `onSwitchPractice`.
- Add its stats slice to `snapshotStats`.

## 7. Routing + surfaces (`src/app/`)

- `PracticeSessionView.tsx`: route the new `kind` to its surface (a new
  `XSessionSurface`, or fall through to `BreathingSessionSurface` if it reuses
  the breathing presentation).
- `PracticeSettingsView.tsx` (`renderForm`): route the new `kind` to its form.
- `setupCardSummary.ts`: add the summary block in `buildSetupCardSummary` and the
  name in `resolveSheetPracticeName`.
- Settings form component (`src/components/XSettingsForm.tsx`): reuse
  `SettingsStepper` (numeric, incl. small discrete sets), `SettingsSegmentedRow`
  (string ids only), `SettingsToggleRow`. A read-only `SettingsStepper`
  (`readOnly`) shows derived values.

## 8. Orb (reuse `OrbShape`)

- `OrbShape` renders from a `SessionFrame` (`phase` `'in'|'out'` + `phaseProgress`
  0..1 → disc scale MIN..MAX). To animate from a setTimeout engine, run a small
  rAF loop that builds a frame from `phaseStartedAt` + `phaseDuration`.
- A **hold** = feed `phase:'in', phaseProgress:1` (disc held at max). KP added an
  opt-in `holdActive` prop to blank the centre glyph during a hold — other
  practices never pass it. Prefer opt-in props over branching shared internals.

## 9. Audio (reuse, don't rebuild)

- All tones live in `nkCueSynth.ts` (markers, OM tick, countdown tick, end chord,
  KP's `scheduleHoldDrone`) or `cueSynth.ts` (HRV bowl). A new practice usually
  needs **no new synth** — map its events to existing schedulers.
- The audio controller hook mirrors `useNaviKriyaAudio`: a swappable proxy
  `SessionClock` (wall → AC → wall), iOS silent-loop bypass on the gesture head,
  `begin()/close()/closeAfterEndCue()`. **The engine consumes `audio.clock`** —
  instantiate audio before the engine. Cues gate on `mutedRef` at schedule time.
- A sustained tone (e.g. a hold drone) = `buildNKToneNodes` with a pad envelope +
  a manual `stop()` that rings out and stops the oscillator.

## 10. Learn / About + Stats

- `src/content/learnContent.ts`: add the practice to the `practices` map (EN +
  pt-BR). `learnPanelModel.ts` indexes `practices[activePractice]` directly, so
  the About page wires up automatically once content exists.
- `StatsPage.tsx` iterates a local `PRACTICE_ORDER` array (not all ids). A
  flag-gated practice can be left out of it (KP recorded stats but showed no row).

## 11. Tests / fixtures the union change will break (tsc points them out)

- `src/storage/practices.test.ts` — default-map literals.
- `src/app/appViewModel.test.ts` — `PracticeSettingsSources` + any `*ViewState`
  fixtures; the controls/session VM call sites.
- `src/app/pages/StatsPage.test.tsx` — the `PracticeStatsMap` + `practiceNames`
  fixtures.
- `src/app/practiceCopy.test.ts` — the `practiceNames` expectation.
- `src/components/PracticeToggle.test.tsx` — stub strings + new props.
- `src/featureFlags.test.ts` — if a flag was added.
- Add focused tests for the new domain math and the engine state machine (KP's
  `useKpEngine.test.ts` drives the setTimeout engine with `vi.useFakeTimers` + a
  fake clock + `vi.fn()` callbacks).

## Gotchas

- **Exhaustive switches are your friend** — never add a `default` that silently
  swallows a new id; let `tsc` flag the gap.
- **`Record<PracticeId>` literals** in tests/fixtures must gain the key — the
  compiler lists every one.
- **`SegmentedControl` needs string ids** — numeric option sets use a stepper.
- **Verify loop:** `npx tsc -b` → `npm run test:run` → `npm run lint` →
  `npm run build`, all green before committing.

## Worked example

The KP practice (all of the above) lives on the branch `feat/kp-practice` —
read its 5 commits for a concrete, end-to-end reference.

> **`feat/kp-practice` is LOCAL-ONLY — never push it to GitHub.** It stays on
> this machine as a reference/experiment. Do not push it, open a PR from it, or
> merge it into `main` unless the operator explicitly asks. KP must not ship.
