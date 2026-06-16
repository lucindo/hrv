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
- [ ] Slice 4 — `SettingsSlider` primitive (continuous range + nudges, aria).
- [ ] Slice 5 — forms swap stepper/segmented ↔ slider by `advanced`; Stretch BPM dynamic bounds; advanced-aware coerce snap (deferred from slice 2).
- [ ] Slice 6 — advanced toggle in Settings → Behavior block + i18n strings.

## Now

**State** — Slices 1–3 landed on `feat/advanced-precise-control`, suite 1350/1350,
build + lint clean. The number model is fully in place: bpm, inhaleShare, and
omSeconds are all bounded numbers; discrete pickers are a UI view. No sliders yet.

**Next** — Slice 4: `SettingsSlider` primitive.

**Deferred** — Advanced-aware coerce snap (Q11 "off ⇒ snap to nearest preset"):
slice 2 coerce only range-validates; real data is preset-valued post-migration,
so the snap is defensive-only — wire it in slice 5 with the forms/toggle.

**Open questions** — None.
