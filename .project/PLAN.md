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

## Now

**State** — Desktop apps SHIPPED. PR #6 merged to `main`; Release **`desktop-v2.5.1`**
live with `HRV-Breathing-2.5.1-{macos-universal.dmg,windows-x64.msi}` attached and
`releases/latest` resolving. New `desktop.yml` (Pake → mac universal + win, publishes
on `desktop-v*` tags) is decoupled from the web `deploy.yml`; flow documented in
`DEPLOYMENT.md`, decisions DA1–DA10 in `DECISIONS.md`. Working tree clean; `main`
pushed to origin.

**Next** — Nothing pending. Optional only: visually verify the Windows `.msi`
icon/launch on a real Windows box.

**Open questions** — None blocking.
- Windows `.msi` icon render + launch never visually confirmed (no Windows box) — the
  build embedded the icon and produced a valid WiX MSI.
- Deferred by decision: macOS padded-squircle icon (DA6), Linux leg (DA2), code
  signing (DA4).
- Pre-existing (web deploy): the 3 Pages-only actions (`configure-pages@v6`,
  `upload-pages-artifact@v5`, `deploy-pages@v5`) prove out only on the next `v*` tag
  deploy; `download-artifact@v8` has since run green in `desktop.yml`.

**Notes** — Two independent release pipelines now: web (`vX.Y` tag → Pages,
`DEPLOYMENT.md`) and desktop (`desktop-v*` tag → GitHub Release, same doc's "Desktop
releases" section).
