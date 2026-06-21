import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

// SessionClock is the substitute for direct wall-clock reads. The audioEngine
// re-export is the preferred entry point so downstream callers don't reach into
// the audio subdirectory's internal layout.
import type { SessionClock } from '../audio/audioEngine'
import type { SessionFrame } from '../domain/sessionMath'
import type { SessionSettings, StretchSettings } from '../domain/settings'
import { DEFAULT_SETTINGS } from '../domain/settings'
import {
  completeIfNeeded,
  endSession,
  extendTimedSession,
  startRoundsSession,
  startSession,
  startStretchSession,
  type SessionState,
} from '../domain/sessionController'
import { LEAD_IN_DURATION_SEC } from '../audio/audioEngine'

/**
 * Running-session snapshot exported for App-side consumption. The hook owns
 * the writer and exposes the read surface via `runningSnapshotRef`. The
 * snapshot persists across the transition out of `running` so the App-level
 * leave-running cleanup effect can compute elapsed without re-narrowing the
 * discriminated union.
 *
 * Lifetime: written once per rAF tick (from inside the setState updater) while
 * status is `running`; persists unchanged after the transition out of running
 * (the hook does NOT null on transition because consumer effects fire AFTER hook
 * effects and need to read the snapshot). The snapshot is overwritten on the
 * next session's first rAF tick. Consumers idempotently dedupe via the `key`
 * field (= startedAtSec, seconds-shaped).
 */
export interface RunningSnapshot {
  key: string
  startedAtSec: number
  lastElapsedSec: number
}

export interface SessionEngine {
  state: SessionState
  /**
   * Per-phase-stable frame identity. Same `===` reference across renders within
   * the same `cycleIndex:phase`. Use for effects that should fire once per phase
   * boundary — NOT for per-frame visual rendering.
   */
  currentFrame: SessionFrame | null
  /**
   * Per-rAF frame value. Identity changes every animation frame; `phaseProgress`
   * and `elapsedMs` are fresh. Use for visual rendering (BreathingShape,
   * SessionReadout) — NOT for phase-boundary effects.
   */
  liveFrame: SessionFrame | null
  /**
   * Running-session snapshot owned by the engine, written from inside the rAF
   * tick setState updater while status is `running`. Persists unchanged across
   * the transition out of running so consumer effects (App's leave-running
   * cleanup) can read the last known elapsed values. Overwritten on the next
   * session's first rAF tick. Read `.current` synchronously; refs are stable —
   * do NOT put in effect dep arrays.
   */
  runningSnapshotRef: RefObject<RunningSnapshot | null>
  setSelectedSettings(this: void, settings: SessionSettings): void
  start(this: void): void
  end(this: void): void
  /**
   * Extends the running timed session by `durationMinutes`. No-op if the
   * session is not in `running`. Rejections from the underlying domain
   * (e.g., `RangeError` when the new duration violates invariants) are
   * silently absorbed — state is left unchanged. Callers cannot distinguish
   * "applied" from "declined"; if a user-facing affordance needs that
   * distinction, surface it from this hook before consumers are wired.
   */
  extendDuration(this: void, durationMinutes: number): void
  /**
   * Reanchor `startedAtSec` after an AudioContext reconstruction (iOS recovery
   * path).
   *
   * When `useAudioCues.reconstructEngine` builds a new AudioContext, the new
   * AC's `currentTime` starts near 0. The proxy's source swaps to the new clock
   * via `setSource(newEngine.clock)` — at the next rAF tick `clock.now()`
   * returns the new AC's currentTime. Without reanchor, `elapsed = clock.now() -
   * startedAtSec` would compute a negative or wildly wrong value.
   *
   * Reanchor math:
   *   `newStartedAtSec = newClockNow - lastFrame.elapsedSec`
   *
   * After reanchor, `elapsed = clock.now() - newStartedAtSec` is:
   *   `≈ newClockNow - (newClockNow - preReanchorElapsed) = preReanchorElapsed`
   * — the elapsed is preserved across the swap.
   *
   * Ordering invariant: this method fires BEFORE `onReanchorRequired` (the
   * audio-anchor reanchor). The caller (`useBreathingSessionController` via
   * `onSessionClockReanchored`) guarantees the ordering.
   *
   * No-op when `status !== 'running'` — reanchor on idle/complete is
   * meaningless (no elapsed to preserve).
   *
   * `startedAtSec` is seconds-shaped.
   */
  reanchorSessionClock(this: void, newClockNow: number): void
}

/**
 * The `clock` arg is the SessionClock substitute for direct wall-clock reads.
 * Callers MUST supply either an `AudioSessionClock` (when an AudioEngine exists)
 * or a `WallSessionClock` (visuals-only fallback). The source can be swapped to
 * audioCtx.currentTime via the SessionClock seam without any caller change.
 */
export function useSessionEngine(
  initialSettings: SessionSettings = DEFAULT_SETTINGS,
  stretchSettings: StretchSettings | null = null,
  clock: SessionClock,
): SessionEngine {
  const [state, setState] = useState<SessionState>(() => ({
    status: 'idle',
    selectedSettings: { ...initialSettings },
  }))

  // Hook owns the running-snapshot ref. Written from inside the rAF tick setState
  // updater (closure-staleness resolution). The hook is the single writer.
  const runningSnapshotRef = useRef<RunningSnapshot | null>(null)

  // STALE-CLOSURE INVARIANT: the dep array below is intentionally
  // `[state.status, clock]` only, so this effect (and its rAF loop) is created
  // ONCE per session (when status transitions to running) and NOT re-created on
  // every per-frame state update. Consequently the `state` value captured in
  // this effect's closure is FROZEN at the value it had when the session entered
  // `running`. Every per-frame value (elapsedSec, lastFrame, cycleIndex,
  // phaseProgress, ...) MUST be read inside the `setState((currentState) => ...)`
  // updater via `currentState` — NEVER from the outer-closure `state`. Reading
  // `state` (or anything derived from it) from inside `tick` would silently
  // observe first-frame-stale data for the entire session. Any future value the
  // loop needs must be threaded through `currentState`, not the closure. `clock`
  // is included in the dep array per exhaustive-deps; callers thread a stable
  // memoized instance, so the rAF loop is not re-created mid-session in practice.
  useEffect(() => {
    if (state.status !== 'running') {
      // DO NOT null the snapshot here. Hook effects (custom-hook useEffects) run
      // BEFORE consumer-component useEffects when both hooks are called in the
      // same component, so nulling on transition out would clobber
      // `runningSnapshotRef.current` BEFORE App's leave-running cleanup effect
      // read it. The snapshot persists across the transition out of running and
      // is overwritten on the next session's first rAF tick (the inside-updater
      // write in `tick` below). App.tsx's `recordedSessionKeyRef` dedupes
      // idempotently via the snapshot's `key` (= startedAtSec), so reading a
      // stale snapshot on a subsequent idle render is safe — the stats write
      // only fires on a fresh key.
      return undefined
    }

    let animationFrameId = 0
    let cancelled = false

    // advance: read the master clock once and commit one state step. Stateless
    // and idempotent per clockNowSec — safe to call from BOTH the rAF loop and
    // the worker heartbeat. Does NOT schedule the next frame (the caller owns
    // cadence) so the worker path cannot accumulate queued rAF callbacks while
    // hidden.
    const advance = () => {
      // Cancel-guard. A call that lands AFTER the effect cleanup ran (jsdom
      // fake-timer rAF drain ordering, an in-flight worker message, or a
      // real-browser race) becomes a no-op — never setState on a torn-down state
      // owner.
      if (cancelled) return

      // Single read of clock.now() — the master clock (audioCtx.currentTime via
      // SessionClock) is the source of truth. The orb tracks true audio time;
      // on resume from a hidden desktop tab (AC kept running) it snaps to the
      // correct position, and on iOS (AC suspended → currentTime frozen)
      // elapsed simply pauses and resumes.
      const clockNowSec = clock.now()

      setState((currentState) => {
        if (currentState.status !== 'running') {
          return currentState
        }

        // Write the running-snapshot from `currentState` (NOT outer-closure
        // `state` — see stale-closure invariant above). Placement: AFTER the
        // early-return that narrowed `currentState` to `RunningSessionState`.
        runningSnapshotRef.current = {
          key: String(currentState.startedAtSec),
          startedAtSec: currentState.startedAtSec,
          lastElapsedSec: currentState.lastFrame.elapsedSec,
        }

        return completeIfNeeded(currentState, clockNowSec)
      })
    }

    // Foreground driver: rAF at ~60fps for smooth visual updates. Self-chaining;
    // re-checks `cancelled` before re-scheduling so a tick whose setState
    // synchronously tears down the effect does not re-arm on a dead owner.
    const tick = () => {
      advance()
      if (!cancelled) {
        animationFrameId = requestAnimationFrame(tick)
      }
    }

    animationFrameId = requestAnimationFrame(tick)

    // Background heartbeat: browsers freeze rAF on a hidden tab, so the rAF loop
    // above stops advancing the frame while hidden. A Worker timer is exempt
    // from the background throttle, so it calls `advance()` (state step only, no
    // rAF re-schedule) every 250ms. setState and the boundary-driven cue top-up
    // effect both still run while hidden, so the cue lookahead queue keeps
    // getting refilled and audio stays alive for the full session. Graceful
    // no-op when Worker is unavailable (jsdom / test / SSR).
    let heartbeat: Worker | null = null
    if (typeof Worker !== 'undefined') {
      heartbeat = new Worker(new URL('./lookaheadHeartbeat.worker.ts', import.meta.url), {
        type: 'module',
      })
      heartbeat.onmessage = () => {
        advance()
      }
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      if (heartbeat !== null) {
        heartbeat.terminate()
      }
    }
  }, [state.status, clock])

  // currentFrame identity recomputes only when `state.status`, `cycleIndex`, or
  // `phase` change — i.e. at a phase boundary. Within a phase (same
  // cycleIndex:phase across rAF ticks), the same `===` reference is returned, so
  // dep-on-currentFrame effects fire once per phase instead of per rAF.
  //
  // TypeScript strict-mode rejects the optional-chain form
  // (`state.lastFrame?.cycleIndex` in the dep array) because `lastFrame` exists
  // only on `RunningSessionState`. Local narrowing surfaces the primitives
  // (`cycleKey` / `phaseKey`) cleanly so the dep array carries only primitives
  // — and they're computed by the same `state.status === 'running'` narrowing
  // the memo body uses, so the memo and its deps stay in lock-step.
  const cycleKey = state.status === 'running' ? state.lastFrame.cycleIndex : null
  const phaseKey = state.status === 'running' ? state.lastFrame.phase : null
  const currentFrame = useMemo<SessionFrame | null>(
    () => (state.status === 'running' ? state.lastFrame : null),
    // Reason: the useMemo body reads `state.lastFrame` only when `state.status === 'running'`; its identity is fully determined by `state.status`, `cycleIndex`, and `phase` (primitives surfaced as `cycleKey`/`phaseKey` above). Adding `state` to the dep array would defeat the per-phase-stable identity contract by re-memoizing on every rAF tick. The local-narrowing is itself the safe-harbor; the disable is annotated to document the intentional deviation from the exhaustive-deps rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.status, cycleKey, phaseKey],
  )

  // Per-rAF live frame. Identity changes every render-cycle by design — visual
  // consumers (BreathingShape, SessionReadout) need fresh `phaseProgress`/
  // `elapsedMs` per frame. Direct read, NO useMemo wrapper.
  const liveFrame: SessionFrame | null = state.status === 'running' ? state.lastFrame : null

  const setSelectedSettings = useCallback((settings: SessionSettings) => {
    setState((currentState) => {
      if (currentState.status === 'running') {
        return currentState
      }

      return {
        status: 'idle',
        selectedSettings: { ...settings },
      }
    })
  }, [])

  // Capture stretchSettings in a ref so the start callback can read the latest
  // value without re-creating the callback every time stretchSettings changes.
  // The start callback has an intentionally-empty dep array (same pattern as
  // end/extendDuration); the ref indirection is the stale-closure-safe approach.
  const stretchSettingsRef = useRef<StretchSettings | null>(stretchSettings)
  useEffect(() => {
    stretchSettingsRef.current = stretchSettings
  }, [stretchSettings])

  const start = useCallback(() => {
    setState((currentState) => {
      if (currentState.status === 'running') {
        return currentState
      }

      // When a stretch settings object is wired in, start a stretch session via
      // startStretchSession instead of the standard startSession. Pass
      // currentState.selectedSettings as the resonant config so it is preserved
      // through the session (startStretchSession stores it in selectedSettings,
      // lockedSettings carries the synthetic lead-in).
      const sSettings = stretchSettingsRef.current
      if (sSettings !== null) {
        return startStretchSession(sSettings, currentState.selectedSettings, clock.now())
      }

      // Resonant with rounds > 1 runs the continuous rounds timeline; rounds === 1 is
      // the standard single-block session.
      if (currentState.selectedSettings.rounds > 1) {
        return startRoundsSession(currentState.selectedSettings, clock.now(), LEAD_IN_DURATION_SEC)
      }

      return startSession(currentState.selectedSettings, clock.now())
    })
  }, [clock])

  const end = useCallback(() => {
    setState((currentState) => {
      if (currentState.status === 'idle') {
        return currentState
      }

      return endSession(currentState)
    })
  }, [])

  const extendDuration = useCallback((durationMinutes: number) => {
    setState((currentState) => {
      if (currentState.status !== 'running') {
        return currentState
      }

      try {
        // Pass a fresh clock reading so `extendTimedSession` recomputes `lastFrame`
        // from `nowSec - startedAtSec`, mirroring how `startSession` is called
        // above (`startSession(..., clock.now())`). Session capture flows through
        // the injected `clock.now()` only.
        return extendTimedSession(currentState, durationMinutes, clock.now())
      } catch (error) {
        if (error instanceof RangeError) {
          return currentState
        }

        throw error
      }
    })
  }, [clock])

  // Reanchor startedAtSec after a proxy source swap (AudioContext reconstruction
  // on iOS). The setState updater narrows on 'running' and rewrites
  // startedAtSec = newClockNow - lastFrame.elapsedSec.
  // Deps are `[]` — the updater reads currentState, no closure over `state`.
  const reanchorSessionClock = useCallback((newClockNow: number) => {
    setState((currentState) => {
      if (currentState.status !== 'running') {
        // No-op: reanchor on idle/complete is meaningless.
        return currentState
      }
      // Reanchor math: preserve pre-reanchor elapsed across the AC swap.
      // newStartedAtSec = newClockNow - elapsedSec
      // Next tick: elapsed = clock.now() - newStartedAtSec
      //          = newClockNow - (newClockNow - preReanchorElapsed)
      //          = preReanchorElapsed  (invariant preserved)
      const newStartedAtSec = newClockNow - currentState.lastFrame.elapsedSec
      return {
        ...currentState,
        startedAtSec: newStartedAtSec,
      }
    })
  }, [])

  return {
    state,
    currentFrame,
    liveFrame,
    runningSnapshotRef,
    setSelectedSettings,
    start,
    end,
    extendDuration,
    reanchorSessionClock,
  }
}
