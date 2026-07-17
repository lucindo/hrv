# Plan

<!-- Prior plan framing (Advanced precise-control) and all completed roadmap sections
were archived 2026-07-17 to `.project/archive/PLAN-2026-07-17.md` by `/ds-project-compact`.
When the next work item starts, its roadmap goes above `## Now`; `## Now` always stays last. -->

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
