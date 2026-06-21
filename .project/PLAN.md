# Plan: Advanced precise-control (free-set velocity & ratio)

Source: `/ds-grill-me` 2026-06-16, decisions D-Q1..Q11 in `.project/DECISIONS.md`.
Prior plan (SSOT cleanup) shipped as v2.4.1 — see git / DECISIONS history.

Goal: one opt-in `prefs.advanced` toggle swaps fixed pickers for continuous
sliders across HRV, Stretch, and Navi. Model collapses to bounded numbers;
discrete presets become a UI view + snap-on-toggle-off.

## Roadmap

- [ ] Domain models velocity/ratio as plain bounded numbers — `omLength`→`omSeconds` (1.0–4.0), `ratio`→`inhaleShare` (10–50, exhale ≥ inhale), HRV `bpm` validator widened to range 1.0–7.0. Presets become UI lists.
- [ ] Engines read the numbers directly — breathing plan derives from `inhaleShare`, NK engine reads `omSeconds` (no map lookup), stretchRamp accepts arbitrary BPM/ratio.
- [ ] Persistence migrates v3→v4 — labels→numbers across resonant/stretch/naviKriya; `prefs.advanced` defaults false on read.
- [ ] Coerce enforces the mode invariant — advanced on ⇒ range-clamp; advanced off ⇒ snap to nearest preset.
- [ ] `SettingsSlider` primitive exists — continuous range + `[−]/[+]` nudges, rounded label, keyboard/aria.
- [ ] Forms swap control by mode — each velocity/ratio control renders stepper/segmented when off, slider when on; Stretch initial/target BPM can't cross.
- [ ] Advanced toggle in Settings → Behavior block — persists, round-trips, snap-on-off works end to end.
- [ ] i18n strings added for toggle + slider aria labels (all locales).

## Re-slice (vertical, green-between — replaces the horizontal roadmap above)

- [x] Slice 1 — `prefs.advanced` flag (default false) + widen `isValidBpm` to range 1–7. (`91769b9`)
- [x] Slice 2 — ratio → `inhaleShare: number` end-to-end (domain/engines/forms/presentation + v3→v4 migration). (`refactor(settings): model breath ratio as numeric inhaleShare`)
- [x] Slice 3 — `omLength` → `omSeconds: number` end-to-end (NK engine, bounds 1.0–4.0s); v4 migration converts the omLength label. (`refactor(navikriya): model OM pace as numeric omSeconds`)
- [x] Slice 4 — `SettingsSlider` primitive (continuous range + nudges, aria). (`feat(settings): add SettingsSlider primitive`)
- [x] Slice 5 — forms swap stepper/segmented ↔ slider by `advanced` (via `useAdvancedMode`); Stretch BPM dynamic bounds. (`feat(settings): wire advanced sliders into the three forms`)
- [x] Slice 6 — advanced toggle in Settings → Behavior + toggle-off snap to nearest preset (Q6) + i18n. (`feat(settings): add Precise control toggle + snap-on-disable`)
- [x] Post-test UI fixes — round free values everywhere they surface: SetupCard BPM + Navi seconds (`8207502`); HRV in-session caption (`bd7ddf1`). Stretch in-session caption already rounds via `toFixed(1)`; Navi has no in-session velocity caption.

## Roadmap — Native desktop apps via Pake (`feat/desktop-pake`)

Decisions DA1–DA10 in `DECISIONS.md`; options in `EXPLORE.md`. Approach B:
dedicated `desktop.yml` wrapping the live PWA, decoupled from `deploy.yml`.

- [x] Local smoke build confirms the locked config (`630×900`, `--hide-title-bar`) and `public/pwa-512x512.png` icon render correctly — icon shows in Dock/Finder, window looks right. *(A smoke test — gated the rest.)*
- [x] pake-cli current stable version resolved and pinned exact (`3.11.10`).
- [x] CI builds a macOS **universal** `.dmg` as a downloadable artifact. (run `27890070656`, 8.3 MB)
- [x] CI builds a Windows `.msi` as a downloadable artifact. (run `27890070656`, valid WiX 3.14 MSI)
- [x] Icon converts in both CI installers (no build failure). *Residual: macOS render visually confirmed (smoke); Windows icon embedded but not visually verified — needs a Windows box.*
- [x] `desktop-v*` tag publishes a GitHub Release with both installers renamed `HRV-Breathing-<version>-macos-universal.dmg` / `-windows-x64.msi`, version from `package.json`. *(Verified: Release `desktop-v2.5.1` published with both renamed assets.)*
- [x] README "Download" section links to `…/releases/latest`.
- [x] First-launch docs cover macOS Gatekeeper (`xattr -dr com.apple.quarantine`) and Windows SmartScreen *Run anyway* — in README **and** the release-page notes.
- [x] First real release cut (`desktop-v2.5.1`): Release live, both installers attached, `releases/latest` resolves. (run `27890468068`; macOS launch confirmed via earlier smoke test, Windows launch unverified — no Windows box.)

## Roadmap — Interval "Rounds" for HRV (`feat/hrv-rounds`, GitHub issue #4)

HRV-only. Opt-in toggle splits a practice into N work blocks separated by a rest +
a per-round 3-2-1 lead-in. **Design A (operator-chosen): ONE continuous engine
session for the whole practice** — pure single clock (no `audioStop` until the final
round/End); reuses the stretch segmented-session + cue-scheduler plumbing; `audioEngine`
untouched. Rest starts only at each block's cycle-rounded end (existing completion rule).

- [x] Slice 1 — domain model + persistence: `SessionSettings.rounds` (1=off) + `restMinutes`; validators; `validateSettings` cross-field (rounds>1 ⇒ finite duration); `coerceSettings` snap; `STATE_VERSION` 4→5 (additive). (`97bf32e`)
- [x] Slice 2a — domain timeline + frame: `buildRoundsTimeline`/`getRoundsFrame` (work blocks held to whole cycles + rest/lead-in gaps, continuous cycleBaseIndex); 5 optional rounds fields on `SessionFrame`. (`2fed424`)
- [x] Slice 2b — engine runs the timeline: `startRoundsSession` + `completeIfNeeded` rounds branch (third alongside stretch); `useSessionEngine.start` dispatches when `rounds>1`. (`f906f1c`)
- [x] Slice 2c — controller orchestration: `BreathSegment` widening of `walkFutureCues`; pure `resolveRoundsCueAction` (per-block cue target, rest/lead-in suppression); `currentFrame` roundPhase-aware; end chord at each work→rest boundary. (`ba4401c`)
- [x] Slice 3 — presentation: `RoundsReadout` ("Round X of N" + rest MM:SS); orb idles in rest/lead-in; 3-2-1 reuses OrbShape leadInDigit; i18n `readout.rest`/`roundOf`. (`b0c9514`)
- [x] Slice 4 — settings form: Rounds toggle (dims count+rest), count 2–10, rest minutes; open-ended dropped when on; snap rounds→1 on off; i18n. (`d8f74c7`)
- [x] Slice 5 — stats: resonant `totalSessions` counts rounds (+N completed / +1 else); StatsPage HRV row relabeled "Rounds"; history-preserving (1 session==1 round), no migration. (`df27414`)

Flagged simplifications (await operator call): (1) rounds-2+ lead-in is VISUAL-ONLY
(no audio ticks — avoids a `scheduleLeadIn` first-In flam; `scheduleLeadInTicks` is the
clean follow-up); (2) total-time stat INCLUDES rest (full wall-clock); (3) early-ended
rounds practice counts as 1 round; (4) round-caption/rest-countdown placement is a
first-pass — visual refinement pending operator review.

## Now

**State** — Rounds feature CODE-COMPLETE on branch `feat/hrv-rounds` (7 commits,
`97bf32e`→`df27414`; branched from `main` @ `f580209`). All 5 slices done; whole
practice runs as one continuous single-clock session. `tsc` + lint clean, full suite
**1418 passing**. NOT merged, NOT pushed. Working tree clean. (Desktop apps from the
prior milestone remain SHIPPED — `desktop-v2.5.1` live.)

**Next** — Operator runs `npm run dev` and tests rounds end-to-end (HRV settings →
Rounds on → 2 rounds / 1-min rest / 5-min duration → start). Then returns with
testing feedback to iterate. Key things to confirm: audio stays in sync across the
rest gap into round 2; silent rest + MM:SS countdown; end chord at each boundary;
3-2-1 between rounds; "Round X of N"; stats add N rounds on a completed practice.

**Open questions** — Awaiting operator's testing feedback. The 4 flagged
simplifications above (visual-only lead-in, total-time-includes-rest, early-end=1
round, caption/countdown placement) are decisions to confirm or change after testing.

**Notes** — Prior milestone (desktop apps) unchanged: web (`vX.Y`→Pages) and desktop
(`desktop-v*`→GitHub Release) pipelines both live; Windows `.msi` launch still
unverified (no Windows box).
