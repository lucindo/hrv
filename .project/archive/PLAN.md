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
- [x] Operator tested the toggle; **shipped v2.7.0** — PR #10 merged (`2c15f21`), tag `v2.7` deployed & promoted to official. Branch deleted.

## Now

**State** — **v2.7.0 shipped & live** — Navi Kriya "Distinct last tick" (opt-in E5 tone on the
last OM of each count, default OFF, enabled only when OM tick is on). PR #10 merged to `main`
(`2c15f21`); tag `v2.7` deployed green and **promoted to official** (root `/hrv/` = v2.7, also
`/hrv/v2.7/`; v2.6 stays at `/hrv/v2.6/`). Feature branch deleted (local + remote). Five review
passes run on the branch (deslop, ts-review, bug-review, test-quality, code-quality) — no
correctness findings; only comment/doc tidy-ups applied. `main` synced, tree clean. Design +
rationale in `DECISIONS.md` (NK-FT-1). Earlier milestones standing: viewport zoom lock (v2.6.2),
Warm-up Off (v2.6.1), Rounds (#4), Desktop `desktop-v1.0.0`.

**Next** — No active work item. Optional follow-ups: `/ds-spec` to fold `distinctFinalTick` into
`SPEC.md`; the deferred `nkCueSynth` `toCueHandle` refactor (below). Otherwise await next request.

**Open questions** — None blocking. (E5 sign-off resolved — operator shipped it.)

**Watch** —
- `SPEC.md` still doesn't cover the `distinctFinalTick` Navi setting → run `/ds-spec` when convenient.
- Deferred code-quality item (report-only, non-blocking): `nkCueSynth.ts` now has three copy-paste
  tick-scheduling twins (`scheduleNKTick` / `scheduleNKFinalTick` / `scheduleCountdownTick`); a
  `toCueHandle` helper could dedupe the identical `ended`/`cancel` lifecycle plumbing while keeping
  each cue's constants independent.
- `package-lock.json` root `version` is intentionally stale (`2.3.3`) — documented in
  `DEPLOYMENT.md`; on the next dependency change, let the lockfile regenerate that field and commit it.
- Prior standing watches: `user-scalable=no` vs WCAG 1.4.4 (accepted); desktop launch unverified on
  Windows/Linux; macOS dmg bundling flaky (pake ×3).

**Notes** — Latest shipped is **v2.7.0** (web tag `v2.7`, official). Patch releases reuse the
`vX.Y` slot by force-moving the annotated tag (runbook `.project/DEPLOYMENT.md`). Tag forms: web
short `vX.Y` (→ `v2.7`); desktop full SemVer `desktop-vX.Y.Z` (→ `desktop-v1.0.0`).
