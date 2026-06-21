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
- [ ] `desktop-v*` tag publishes a GitHub Release with both installers renamed `HRV-Breathing-<version>-macos-universal.dmg` / `-windows-x64.msi`, version from `package.json`. *(Rename + naming verified on the artifacts; publish step runs first on the real tag — task below.)*
- [x] README "Download" section links to `…/releases/latest`.
- [x] First-launch docs cover macOS Gatekeeper (`xattr -dr com.apple.quarantine`) and Windows SmartScreen *Run anyway* — in README **and** the release-page notes.
- [ ] First real release cut (`desktop-v2.5.1`): Release live, both installers download and launch. *(Requires merge to `main` first so the workflow is on the default branch.)*

## Now

**State** — SHIPPED & DEPLOYED. **v2.5.1** released: stretch completion now holds to
the end of the final breath cycle like HRV (PR #5; decision SC-1 in DECISIONS.md).
`package.json` 2.5.1; `v2.5` tag moved + deployed live to lucindo.github.io/hrv/.
Also landed: `.project/DEPLOYMENT.md` release runbook, and CI actions bumped to
Node-24 runtimes (`06e809d`). Working tree clean; `main` @ `06e809d`.

**Next** — Nothing pending. Pick up new work, or an optional follow-up below.

**Open questions** — None blocking.
- CI bump partially verified: `checkout@v6`/`setup-node@v6`/`upload-artifact@v7` ran
  clean on a dispatch; the 4 Pages-chain actions (`download-artifact@v8`,
  `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`) were skipped
  (`assemble-and-deploy` skips on `workflow_dispatch`) — full proof comes on the next
  `v*` tag deploy; same versions already run end-to-end in `lucindo/pb`.
- Cosmetic, no operator reply: OM-pace "s" unit hardcoded (not in `strings.ts`);
  Stretch in-session caption `toFixed(1)` vs `formatTrimmed` (2 dp) elsewhere.

**Notes** — Release/deploy mechanics now documented in `.project/DEPLOYMENT.md`
(tag = `vX.Y`, patches move the tag, `versions.json.official` drives root).
