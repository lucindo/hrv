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

## Now

**State** — COMPLETE. All 6 slices landed on `feat/advanced-precise-control`,
suite 1373/1373, build + lint clean. The "Precise control" toggle (Settings →
Advanced → Behavior) swaps the discrete pickers for continuous sliders across
HRV, Stretch, and Navi; turning it off snaps values back to presets. v3→v4
migration converts persisted labels to the number model.

**Next** — Operator visual test. Then merge `feat/advanced-precise-control` → `main`
and release if approved.

**Deferred → resolved** — The Q11 coerce-snap was implemented instead as the Q6
toggle-off reconcile (`useSnapToPresets`), which updates live state immediately;
no coerce-signature change was needed.

**Open questions** — None.
