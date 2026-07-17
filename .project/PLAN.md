# Plan

<!-- Prior plan framing (Advanced precise-control) and all completed roadmap sections
were archived 2026-07-17 to `.project/archive/PLAN-2026-07-17.md` by `/ds-project-compact`.
When the next work item starts, its roadmap goes above `## Now`; `## Now` always stays last. -->

## Roadmap — Navi Kriya: distinct final-OM tone (perfect fifth)

Source: user request (Joey, Forrest's sangha, 2026-07-17). The last OM of each count
(front's `frontCount`-th, back's `backCount`-th) is currently the same A4 tick as every
other OM, so the practitioner can't anticipate the phase switch. Signal it a perfect
fifth above.

Design (locked): final OM of **both** front and back counts plays a tick a perfect fifth
above the standard — A4 440 Hz → **E5 660 Hz** (ratio 1.5, the interval already used by
the 3-2-1 countdown beep). Same soft-tick character (duration/level/decay), pitch only.
Gated on `perOmCue` — ticks off ⇒ no final-OM tone. NOTHING else changes: the 1.5×
last-OM hold, `pendingTransition` deferral, front/back breath-cue markers, `NK_LEAD_SEC`
lead, end chord, and countdown beep are all untouched. The only change is the last tick's
pitch.

No-design-locking: E5/660 is the intended default but stays swappable — tests assert the
routing/behavior (a distinct final cue on the last OM of each phase, gated by `perOmCue`),
NOT the exact frequency, so slice 4 can choose the final sound without fighting tests.

- [ ] Slice 1 — synth: pitched final-OM tick in `nkCueSynth.ts` (`fundamentalHzIn × 1.5` = 660; reuse the tick recipe). → verify: builder unit test.
- [ ] Slice 2 — engine: `stepOm` fires a new `finalTick()` callback on the last OM of each phase (`count >= target`) instead of `tick()`, under the same `cueOn` gate; stays audio-agnostic. → verify: fake-timer test — `finalTick` on front + back target, `tick` otherwise, neither when `cueOn` off.
- [ ] Slice 3 — audio hook: map `finalTick` → pitched builder (muted-gated, same as `tick`); single swap point for the test-time sound choice. → verify.
- [ ] Slice 4 — audition & lock: operator tries candidate final-OM sounds end-to-end and picks; lock the choice.

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
