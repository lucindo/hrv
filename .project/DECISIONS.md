# Decisions

Active decisions still governing the project. Superseded/expired entries were moved
to `.project/archive/DECISIONS-2026-07-17.md` by `/ds-project-compact` (SSOT cleanup
D1–D12, Advanced precise-control Q1–Q11, Native desktop DA1–DA10).

---

# Decision — Stretch completion holds the final cycle (2026-06-20)

Source: `/ds-debug` — operator reported the Stretch end screen/sound firing at
countdown-zero, cutting the last In/Out (HRV already holds it).

## SC-1 — Hold Stretch completion to the end of the in-progress cool-down cycle

**Q:** Stretch fired `isComplete` and the end chord at `finalSegment.endSec` (the
exact requested total — a deliberately PARTIAL final cycle), so the last breath was
cut mid-exhale at 0:00. HRV rounds completion up to the cycle via `getCompletionSec`.
Match HRV, or keep the exact-total cutoff?

**Decision:** Match HRV. Added `getStretchCompletionSec(segments)` = the cool-down's
partial `endSec` rounded UP to the next whole cool-down cycle. `getStretchFrame`
keys `isComplete` and its clamp ceiling off it (the orb advances through the final
exhale), and `resolveTargetSec` uses it so cues + end chord fire at the true cycle
end. `remainingSec` and the displayed Duration (`computeStretchTotalSec` = `endSec`)
are unchanged — the countdown still reaches 0:00 at the requested total.

**Supersedes:** the "realized session total equals the requested whole-minute total
exactly" property (plan 34-10 / UAT GAP-1, and SPEC.md D-5/FR-6 "displayed Duration
equals the real session length"). The *displayed* total still equals the request;
the session now ends up to one cool-down breath cycle (60/targetBpm seconds) later to
finish the breath — exactly as HRV already runs past its displayed duration. The
segment table itself is unchanged (`endSec` still == requested total), so
`buildStretchSegments` / `computeStretchTotalSec` and their docstrings remain accurate.

---

# Decision — Lock viewport zoom (2026-07-14)

Source: operator request — disallow zooming the app.

## VP-1 — Disable pinch/double-tap zoom via the viewport meta

**Q:** Allow browser zoom, or lock it?

**Decision:** Lock it. `index.html` viewport meta →
`width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`.
Shipped as patch **2.6.2** (web tag `v2.6` force-moved, PR #9).

**Tradeoff (accepted):** `user-scalable=no` disables pinch-zoom — cuts against WCAG
1.4.4 (users who rely on zoom for low vision). The a11y cost was surfaced and accepted
per explicit operator request.

**Rationale:** Operator request. HRV is a fixed, full-screen breathing surface — also
installed as a PWA and wrapped in the Pake desktop shell — where an accidental pinch or
double-tap zoom shifts the layout and disrupts a guided session. Locking the viewport
keeps it stable and app-like; the a11y cost is the accepted tradeoff above.
