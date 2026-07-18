# Plan

<!-- Prior plan framing (Advanced precise-control) and all completed roadmap sections
were archived 2026-07-17 to `.project/archive/PLAN-2026-07-17.md` by `/ds-project-compact`.
When the next work item starts, its roadmap goes above `## Now`; `## Now` always stays last. -->

## Roadmap — Navi Kriya: distinct final-OM tone → opt-in setting (branch `feat/nk-final-om-tone`)

Source: user request (Joey, Forrest's sangha, 2026-07-17). The last OM of each count
(front's `frontCount`-th, back's `backCount`-th) was the same A4 tick as every other OM,
so the practitioner couldn't anticipate the phase switch. Signal it a perfect fifth above.

Design (locked): final OM of **both** front and back counts plays a tick a perfect fifth
above the standard — A4 440 Hz → **E5 660 Hz** (ratio 1.5, the interval already used by
the 3-2-1 countdown beep). Same soft-tick character (duration/level/decay), pitch only.
NOTHING else changes: the 1.5× last-OM hold, `pendingTransition` deferral, front/back
breath-cue markers, `NK_LEAD_SEC` lead, end chord, and countdown beep are all untouched.

No-design-locking: E5/660 lives only in `nkCueSynth.ts` — tests assert the routing/behavior
(a distinct final cue on the last OM of each phase), NOT the exact frequency.

- [x] Slice 1 — synth: `scheduleNKFinalTick` (`fundamentalHzIn × NK_FINAL_TICK_PITCH_RATIO (1.5)` = 660; reuses the tick recipe). (`c265fb1`)
- [x] Slice 2 — engine: `stepOm` fires a new optional `finalTick()` on the last OM of each phase instead of `tick()`, under the `cueOn` gate; falls back to `tick()` when audio supplies none. (`22f045a`)
- [x] Slice 3 — audio hook: `useNaviKriyaAudio` maps `finalTick` → `scheduleNKFinalTick` (muted-gated). (`9888f2d`)
- [x] Slice 4 — audition & lock: operator tested end-to-end and kept the E5 pitched soft-tick. **Locked.**

### Pivot — make it an opt-in setting (`distinctFinalTick`)

After auditioning, operator chose to gate the distinct tone behind a Navi config toggle
("Distinct last tick"), **default OFF**, enabled only when "OM tick" (`perOmCue`) is on
(grayed otherwise). No mid-session live toggle — Navi settings aren't editable during a
session (Mute is the only in-session audio control).

- [x] Slice 1 — domain + persistence: `distinctFinalTick: boolean` on `NaviKriyaSettings` + `DEFAULT_NK_SETTINGS` (false); coerce default-on-read (additive, **no `STATE_VERSION` bump**). (`0ee1904`)
- [x] Slice 2 — engine gate: `finalCueOn` in the engine record from `settings.distinctFinalTick`; dispatch gates `isFinalOm && finalCueOn && cbs.finalTick`, else normal tick. (`4d67a5d`)
- [x] Slice 3 — form + i18n: "Distinct last tick" `SettingsToggleRow` (`disabled={!perOmCue}`); `distinctFinalTickLabel` EN "Distinct last tick" / pt-BR "Toque final distinto". (`b4920fc`)
- [ ] Operator end-to-end test of the toggle → PR + push `feat/nk-final-om-tone` → merge.

## Now

**State** — Feature branch **`feat/nk-final-om-tone`**, tree clean: Navi Kriya "Distinct last
tick" — opt-in E5 tone on the last OM of each count (default OFF, enabled only when OM tick is
on). All 6 code slices done + full suite **1430** green, `tsc`/lint clean. Operator was testing
the toggle end-to-end at checkpoint — **verdict not yet recorded**. Design + rationale in
`DECISIONS.md` (NK-FT-1). Latest *shipped* release remains **v2.6.2** (viewport zoom lock), live;
earlier milestones standing: Warm-up Off (v2.6.1), Rounds (#4), Desktop `desktop-v1.0.0`.

**Next** — Confirm the operator's end-to-end test verdict on the toggle; if good, open a PR for
`feat/nk-final-om-tone` (requires a push — confirm first) and merge to `main`. Then a web release
when ready: new `vX.Y` tag (minor — new feature).

**Open questions** — Operator's final sign-off on the E5 sound *inside the in-app toggle* (the
console audition was liked; the toggle test was still in progress at checkpoint).

**Watch** — Nothing on this feature is on origin yet: `main` has 1 unpushed commit (`273d306`),
and the branch is 7 commits ahead of `main` — its `PLAN.md`/`DECISIONS.md` updates reach `main`
only via the PR. `SPEC.md` doesn't mention the new Navi setting — consider `/ds-spec` after merge.
Console audition of NK cues: dev serves modules under the `/hrv/` base, so
`import('/hrv/src/audio/nkCueSynth.ts')`. Prior watches still stand: `user-scalable=no` vs WCAG
1.4.4 (accepted); desktop launch unverified on Windows/Linux; macOS dmg bundling flaky (pake ×3).

**Notes** — Patch releases reuse the `vX.Y` slot by force-moving the annotated tag (runbook
`.project/DEPLOYMENT.md`). Tag forms: web short `vX.Y` (→ `v2.6`); desktop full SemVer
`desktop-vX.Y.Z` (→ `desktop-v1.0.0`).
