# now
All three practices (HRV, Stretch, Navi Kriya) shipped and live; nothing in flight.

# next
Optional: dedupe the three copy-paste tick schedulers in `src/audio/nkCueSynth.ts` behind a `toCueHandle` helper.

# settled
- No backend, telemetry, analytics, or third-party scripts — settings and stats live in `localStorage` on-device only.
- Copy carries no diagnostic or clinical claims — guided breathing practice only, not medical advice.
- The two session engines stay separate — never merge `useSessionEngine` (rAF) and `useNKEngine` (setTimeout).
- Wake Lock is progressive enhancement — sessions must run correctly when it is unavailable.
- Stretch deliberately runs past the 0:00 countdown to finish the final cool-down breath — the displayed Duration is not the realized end.
- A short Ramp with a wide BPM span may inflate the realized total past the nominal phase sum — accepted, no guard.
- Viewport zoom is locked via `user-scalable=no` by operator request — the WCAG 1.4.4 cost was surfaced and accepted.
- Web release tags are short `vX.Y` matching `package.json.version`'s first two segments; desktop tags are full `desktop-vX.Y.Z`.
- Patch releases reuse the `vX.Y` slot by force-moving the annotated tag — never cut a new tag for a patch.
- `package-lock.json`'s root `version` is npm-managed — never hand-edit it, let a dependency change regenerate it.
- The storage boundary coerces non-throwing and self-heals; the domain boundary validates and throws `RangeError`.
- `.github/dependabot.yml` is removed — no automated version-update PRs; security alerts/updates still run at the repo level; bump flagged deps manually (`npm update`, verify osv-scanner/npm audit) and close any stale PRs by hand.
- `feat/kp-practice` stays local — never push or merge it without an explicit ask.

# hazards
- `.github/workflows/deploy.yml`: dropping `[skip ci]` from the commit-back or adding a `push: branches` trigger creates a deploy loop.
- `src/storage/storage.ts`: bumping `STATE_VERSION` runs `migrateEnvelope` over every persisted slice — an additive field needs only a default in its `coerce*`.
- `src/content/strings.ts`: `ratioLabel` is shared with the Resonant form — Stretch has its own `startRatioLabel`/`targetRatioLabel`.
- `package.json`: the `filelist` override is what patches brace-expansion — overriding `brace-expansion` itself breaks `minimatch@5`, whose CJS require expects a callable.
