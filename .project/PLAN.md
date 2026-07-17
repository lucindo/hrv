# Plan: Advanced precise-control (free-set velocity & ratio)

Source: `/ds-grill-me` 2026-06-16, decisions D-Q1..Q11 in `.project/DECISIONS.md`.
Prior plan (SSOT cleanup) shipped as v2.4.1 — see git / DECISIONS history.

Goal: one opt-in `prefs.advanced` toggle swaps fixed pickers for continuous
sliders across HRV, Stretch, and Navi. Model collapses to bounded numbers;
discrete presets become a UI view + snap-on-toggle-off.

<!-- Completed roadmap sections (Advanced precise-control, Native desktop apps,
Interval Rounds, Stretch Warm-up Off, Lock viewport zoom) archived 2026-07-17 to
`.project/archive/PLAN-2026-07-17.md` by `/ds-project-compact`. -->

## Now

**State** — Latest ship: **Lock viewport zoom** (PR #9 merged @ `10b5937`), released as
patch **v2.6.2** — `v2.6` tag moved `e3767b2 → 10b5937` + force-pushed, deploy `29334951869`
green (7/7), root `/hrv/` and `/hrv/v2.6/` both 200, `user-scalable=no` live. Earlier
milestones still standing: Warm-up Off (v2.6.1), Rounds (issue #4 closed), Desktop
`desktop-v1.0.0`. `main` synced; tree clean.

**Next** — Nothing outstanding. No `desktop-v*` re-release needed (desktop loads the live URL,
picks up v2.6.2 automatically). Future patches: move the `v2.6` tag; future minors: new `vX.Y` tag.

**Open questions** — None blocking. Rounds simplifications (2) total-time includes rest and
(3) early-end counts as 1 round remain accepted as-built.

**Watch** — `user-scalable=no` disables pinch-zoom (WCAG 1.4.4); accepted, but revisit if
low-vision access is reported. Desktop launch still unverified on Windows + Linux (no boxes);
macOS confirmed. macOS dmg bundling flaky — workflow retries pake (×3).

**Notes** — Patch releases reuse the `vX.Y` slot by force-moving the annotated tag (runbook
`.project/DEPLOYMENT.md`). Tag forms: web short `vX.Y` (→ `v2.6`); desktop full SemVer
`desktop-vX.Y.Z` (→ `desktop-v1.0.0`).
