// React hook wrapping the audioEngine service. Owns the React-side state
// machine (status + audioAvailable + muted) and the imperative API consumed
// by App.tsx.
//
// State machine: 'idle' → 'lead-in' (success) | 'failed' (AC construction error).
//
// muted defaults to `initialMuted`, or false (first-visit audio is ON) when
// the parent does not supply a value.
// The hook itself does NOT persist the value — App.tsx wraps setMuted to call saveMute.
//
// Cleanup posture: the unmount effect closes the engine if one is alive.
// Mirrors the cancelled-flag idiom from useSessionEngine.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BreathingPlan } from '../domain/breathingPlan'
import {
  createAudioEngine,
  type AudioEngine,
  type AudioStatus,
} from '../audio/audioEngine'
import type { AudioStatusFlag } from '../audio/audioStatus'
// Stable-identity proxy clock backed by the AC clock during sessions.
import { createSwappableSessionClock } from '../audio/swappableSessionClock'
import { createWallSessionClock } from '../audio/sessionClock'
import type { SessionClock } from '../audio/sessionClock'
// TimbreId is captured per-session via `start(plan, timbre)` and stored
// synchronously into `timbreRef` BEFORE any await. DEFAULT_TIMBRE is the ref's
// initial value — overwritten at the user's first Start click. The hook NEVER
// reads user prefs for timbre — caller (App.tsx) owns the storage read.
import { DEFAULT_TIMBRE, type TimbreId } from '../domain/settings'

export type { AudioStatus }
export type { AudioStatusFlag } from '../audio/audioStatus'

export interface UseAudioCues {
  status: AudioStatus
  /** True if the AudioContext was created successfully; false if the visuals-only fallback path was taken. */
  audioAvailable: boolean
  /** Current mute state (default false — first-visit audio is ON). */
  muted: boolean
  /**
   * Stable-identity proxy `SessionClock`. Same `===` reference for the
   * lifetime of the hook instance — identity never changes across renders or source swaps.
   *
   * Built from `createSwappableSessionClock(createWallSessionClock())` exactly
   * once via `useMemo([], [])` inside the hook body.
   *
   * `clock.now()` delegates to the wall clock before `start()` and to
   * `engine.clock` after `start()` sets `proxyMemoRef.current.setSource(engine.clock)`.
   *
   * On `reconstructEngine`, `proxyMemoRef.current.setSource(newEngine.clock)`
   * is called BEFORE the `onReanchorRequired` callback fires. Subscribers (e.g.,
   * `useSessionEngine` via the clock dep) do NOT need to re-subscribe — the
   * proxy's subscription-survival semantics keep all callbacks forwarded to the
   * new source automatically.
   */
  clock: SessionClock
  /** Called from the Start session click handler (user gesture). Awaits AC creation. May fail
   *  → audioAvailable=false, status='failed'. Returns the audioTime of the first In cue
   *  (or null if AC failed).
   *
   *  `timbre`: TimbreId captured at session start; engine uses this value for every
   *  cue in the session including reconstruction — App.tsx passes prefs.timbre
   *  snapshot. The hook freezes the value into `timbreRef` BEFORE any await; a cross-tab
   *  prefs mutation during the gesture chain or during a later iOS visibility-suspend
   *  recovery NEVER leaks into the active session.
   *
   *  `bypassSilentMode`: optional 3rd arg threaded to
   *  `createAudioEngine({ bypassSilentMode })`. Captured into `bypassSilentModeRef`
   *  synchronously BEFORE the await (mirrors the `timbreRef` posture). Replayed from
   *  that ref inside `reconstructEngine` — a mid-session toggle does NOT live-update;
   *  the flag is read at engine-construction time only. Undefined passes through
   *  to the engine, where it coerces to "construct" (backward-compat). */
  start(this: void, plan: BreathingPlan, timbre: TimbreId, bypassSilentMode?: boolean): Promise<number | null>
  /** Called when session ends. Closes AC. Resets status to 'idle'. */
  stop(this: void): Promise<void>
  /** Toggle mute. Pass true to mute, false to unmute. */
  setMuted(this: void, muted: boolean): void
  /** Notify a phase boundary at audioTime — the engine schedules the In or Out cue.
   *  App.tsx calls this as it transitions cycleIndex/phase. `phaseDurationSec` is
   *  the length of the UPCOMING phase (derived from plan.inhaleSec / plan.exhaleSec
   *  — ms→sec cascade); the engine forwards it to cueSynth so the
   *  bowl-cue decay envelope stretches with the phase length at low BPM. */
  notifyPhaseBoundary(this: void, args: { newPhase: 'in' | 'out'; audioTime: number; phaseDurationSec: number }): void
  /** Dispatch a caller-supplied list of pre-computed cues via engine.topUpLookahead.
   *  The controller calls this on every session frame (rAF tick) with the walkFutureCues output.
   *  Facade: delegates to engine.topUpLookahead({ cues }); no-op if engine is null (before start). */
  topUpLookahead(this: void, cues: Array<{ audioTime: number; phaseDurationSec: number; kind: 'in' | 'out' }>): void
  /** Cancel all future cues in the engine's activeCues queue.
   *  The controller calls this immediately before audioTopUpLookahead() on every
   *  session.currentFrame change (cancel-then-reschedule per the SCHED-05 doctrine).
   *  Facade: delegates to engine.cancelFutureCues(); no-op if engine is null (before start). */
  cancelFutureCues(this: void): void
  /** Returns engine.clock.now() (= AC currentTime), or null if
   *  AC unavailable. App.tsx uses this for the dual-anchor.
   *  audioNow reads through the SessionClock seam (engine.clock.now()); the
   *  underlying source is still the AC clock. */
  audioNow(this: void): number | null
  /** Play the shared session-ending chord — App.tsx calls this on a natural
   *  HRV completion (parity with the Navi Kriya end cue). No-op if the AC is
   *  unavailable or muted; the engine keeps the AC alive until it rings out. */
  playEndChord(this: void): void
  /** Schedule the between-rounds 3-2-1 ticks at the given audio time (no first In cue).
   *  No-op if the engine is null (before start). */
  scheduleLeadInTicks(this: void, startAudioTime: number): void
  /** See AudioStatusFlag JSDoc. App view-model reads this to drive
   *  MuteToggle's needsResume prop. */
  audioStatus: AudioStatusFlag
  /** Gesture-attached recovery seam. The app controller awaits this from
   *  inside the mute-button click handler when audioStatus === 'needs-resume'.
   *  Internally calls engine.resume() first; falls back to engine reconstruction
   *  (close + new createAudioEngine + setMuted replay + re-anchor signal) if
   *  resume cannot recover the AC. All chained synchronously inside the click
   *  handler so the iOS gesture context spans both calls. */
  resume(this: void): Promise<void>
}

export function useAudioCues(
  initialMuted?: boolean,
  onReanchorRequired?: (newAudioAnchor: number) => void,
  onSessionClockReanchored?: (newClockNow: number) => void,
): UseAudioCues {
  // Stable-identity proxy clock. Built ONCE per hook instance via useMemo with
  // empty deps — the `clock` reference is NEVER rebuilt by setSource(). Store as
  // a ref to avoid adding proxyMemo to useCallback dep arrays (proxyMemo IS
  // stable, but adding it would surface as an exhaustive-deps warning because the
  // rule cannot statically prove a useMemo return is stable). Using a ref as a
  // stable handle is the cleanest posture.
  const proxyMemo = useMemo(() => createSwappableSessionClock(createWallSessionClock()), [])
  const proxyClock = proxyMemo.clock
  // Stable ref handle: proxyMemoRef.current is always the same useMemo-created object;
  // calling proxyMemoRef.current.setSource(next) avoids @typescript-eslint/unbound-method
  // and does not introduce any new dep into useCallback arrays.
  const proxyMemoRef = useRef(proxyMemo)

  // Imperative resource — engineRef is NOT in render state because each AC create/close
  // is a side effect, not a UI value. Mirrors useSessionEngine.ts's animationFrameId posture.
  const engineRef = useRef<AudioEngine | null>(null)
  // Cache the firstInCueTime returned by the original engine.scheduleLeadIn call so a
  // defensive double-call to start() returns the deterministic anchor (matching the JSDoc
  // contract on start()) instead of a fresh "now + 3" projection that drifts from the
  // actual scheduled cue time.
  const firstInCueTimeRef = useRef<number | null>(null)
  // Monotonic counter; bumped on every reconstruct, stop, and unmount; checked
  // post-await to detect cancellation. Layered ON TOP of the existing
  // synchronous-null pattern — DO NOT remove synchronous-null.
  const reconstructGenerationRef = useRef<number>(0)
  const [status, setStatus] = useState<AudioStatus>('idle')
  // Persisted mute preference is restored at construction time when the parent
  // supplies it. When `initialMuted` is undefined, fall back to false (first-visit
  // audio is ON).
  const [muted, setMutedState] = useState<boolean>(initialMuted ?? false)
  // Mute state mirrored into a ref so callbacks that read mute (start,
  // reconstructEngine) drop `muted` from their useCallback dep arrays without
  // losing access to the current value. Layered ON TOP of the existing useState
  // [muted, setMutedState] above — does NOT replace it (the React state is still
  // the UI-binding source for MuteToggle and the mute-persistence path).
  const mutedRef = useRef<boolean>(initialMuted ?? false)
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])
  // Mirror of mutedRef's synchronous-pre-await capture posture for the session
  // timbre. Set inside start(plan, timbre) BEFORE the first await; read inside
  // reconstructEngine BEFORE any await. NO useEffect mirror needed — timbreRef is
  // only ever set synchronously inside start() and read synchronously inside
  // reconstructEngine(). Unlike mutedRef, there is no React state that drives it;
  // App.tsx passes the snapshot directly to start(). Reconstruction NEVER re-reads
  // user prefs for timbre — the session's first-Start choice is preserved across
  // iOS visibility-suspend recovery.
  const timbreRef = useRef<TimbreId>(DEFAULT_TIMBRE)
  // bypassSilentMode captured at engine-construction time (start) and replayed
  // during reconstruction — mirrors the timbreRef posture exactly. Initial value
  // is undefined (undefined → engine coerces to "construct" → backward-compat
  // behavior). NO useEffect mirror: only ever set synchronously in start() and
  // read in reconstructEngine().
  const bypassSilentModeRef = useRef<boolean | undefined>(undefined)
  const [audioAvailable, setAudioAvailable] = useState<boolean>(true)

  // High-level audio-path health surface.
  const [audioStatus, setAudioStatus] = useState<AudioStatusFlag>('ok')

  // Gate audioStatus = 'needs-resume' on a prior resume attempt for THIS suspend
  // cycle. Without this, AC startup's transient 'suspended' → 'running' transition
  // would briefly flash the affordance for one render. Reset to false on every
  // transition back to 'running' (or on stop()).
  const visibilityResumeAttemptedRef = useRef<boolean>(false)

  /** Cache the last cues array dispatched via topUpLookahead.
   *  handleForceTopUp re-dispatches this on clock.onResume so AC reconstruction /
   *  iOS unlock force-tops up before the next rAF tick fires. Stale by ≤ 1 rAF
   *  (~16ms); engine's SAFE_LEAD_SEC callee clamp absorbs the drift. */
  const lastTopUpCuesRef = useRef<Array<{ audioTime: number; phaseDurationSec: number; kind: 'in' | 'out' }>>([])

  // Re-anchor callback stored in a ref to avoid closure-capture issues when
  // App.tsx passes a new callback identity per render. The reconstruction path
  // reads this ref synchronously and invokes the latest callback.
  const onReanchorRequiredRef = useRef<typeof onReanchorRequired>(onReanchorRequired)
  useEffect(() => {
    onReanchorRequiredRef.current = onReanchorRequired
  }, [onReanchorRequired])

  // Mirror of onReanchorRequiredRef for the session-clock reanchor callback.
  // Fires in reconstructEngine BEFORE onReanchorRequired (ordering invariant).
  const onSessionClockReanchoredRef = useRef<typeof onSessionClockReanchored>(onSessionClockReanchored)
  useEffect(() => {
    onSessionClockReanchoredRef.current = onSessionClockReanchored
  }, [onSessionClockReanchored])

  // Clock subscriptions (suspend/resume/close) live alongside engineRef. Must be
  // torn down before engineRef is nulled (stop()) or reassigned (reconstructEngine).
  // handleSuspend MUST be subscribed before any resume() call that might reject —
  // confirmed by start() ordering (subscriptions added immediately after
  // engineRef.current = engine, before any external code can call engine.resume()).
  const clockUnsubsRef = useRef<Array<() => void>>([])

  // Three clock subscribers — one per channel (suspend / resume / close).
  // AudioStatusFlag is exactly `'ok' | 'needs-resume' | 'unavailable'`.
  //   - handleResume: clears the needs-resume state when AC transitions to running.
  //   - handleSuspend: flips to needs-resume when a prior visibility-resume attempt
  //     is in flight for this cycle (the resume-attempt gate).
  //   - handleClose: sets unavailable when the AC transitions to closed.
  const handleResume = useCallback((): void => {
    if (engineRef.current === null) return
    visibilityResumeAttemptedRef.current = false
    setAudioStatus('ok')
  }, [])

  const handleSuspend = useCallback((): void => {
    if (engineRef.current === null) return
    // Resume-attempt gate: only flip to 'needs-resume' when a prior visibility-driven
    // resume attempt is in flight for this suspend cycle. Startup-time transient
    // suspended → running transitions are intentionally ignored.
    if (visibilityResumeAttemptedRef.current) {
      setAudioStatus('needs-resume')
    }
  }, [])

  const handleClose = useCallback((): void => {
    // engine.clock.onClose fires this when the AC transitions to 'closed' — whether
    // via stop()/reconstructEngine paths OR an unexpected browser-side AC kill.
    if (engineRef.current === null) return
    setAudioStatus('unavailable')
  }, [])

  // Force-top-up handler subscribed to clock.onResume.
  // Re-dispatches the last cues array passed to topUpLookahead so the lookahead
  // queue refills before the next rAF tick fires (covers AC reconstruction /
  // iOS unlock / engine swap). Cached cues may be �� 1 rAF stale (~16ms);
  // engine's SAFE_LEAD_SEC callee clamp absorbs drift.
  // Same defensive-gate posture as handleResume: engineRef null-gate + early return.
  const handleForceTopUp = useCallback((): void => {
    // AC reconstruction / iOS unlock force-top-up. Re-dispatches last cues so
    // the queue refills before the next rAF tick fires.
    const engine = engineRef.current
    if (engine === null) return
    const cues = lastTopUpCuesRef.current
    if (cues.length === 0) return // No prior dispatch (e.g., lead-in still running) — safe no-op.
    engine.topUpLookahead({ cues })
  }, [])

  // Cleanup-on-unmount: close the engine if a session is still alive.
  // Rapid mount/unmount during dev/strict-mode would otherwise leak AudioContexts.
  // Browsers cap concurrent ACs (~6 in Chrome) before refusing new ones.
  useEffect(() => {
    return () => {
      // Invalidate any in-flight reconstruct. Reading .current inside cleanup is
      // intentional — the ref always holds the latest counter value at cleanup time;
      // the exhaustive-deps rule's warning about stale .current does not apply to a
      // monotonic counter that is only ever mutated, never captured for later reads.
      reconstructGenerationRef.current += 1
      // Tear down clock subscriptions on unmount — mirrors stop()'s posture.
      // Prevents unbounded subscriber Set growth across mount/unmount cycles.
      for (const off of clockUnsubsRef.current) off()
      clockUnsubsRef.current = []
      const engine = engineRef.current
      if (engine !== null) {
        void engine.close()
        engineRef.current = null
      }
      firstInCueTimeRef.current = null
    }
  }, [])

  // Visibility-resume listener.
  // Mirrors useWakeLock.ts — same shape, same gate posture. The hook owns its own
  // DOM listener so the audioEngine stays free of document.* / window.* access.
  // The single gate is engineRef.current !== null. visibilityResumeAttemptedRef is
  // set to true BEFORE the void-call, which arms the resume-attempt gate inside
  // handleSuspend so a subsequent 'suspended'/'interrupted' transition can flip
  // audioStatus = 'needs-resume'. The optimistic resume call is preserved —
  // sometimes it works without a gesture (headphone in, brief lock, certain iOS
  // versions). When it rejects, the affordance becomes the user's recovery path.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return
      if (engineRef.current === null) return
      // Arm the gate BEFORE the resume call so a subsequent 'suspended'/'interrupted'
      // statechange can transition audioStatus.
      visibilityResumeAttemptedRef.current = true
      void engineRef.current.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const start = useCallback(
    async (plan: BreathingPlan, timbre: TimbreId, bypassSilentMode?: boolean): Promise<number | null> => {
      // Defensive: if the hook user accidentally calls start() twice without stop(),
      // return the cached firstInCueTime from the ORIGINAL schedule, not a freshly-
      // projected "now + 3" — those two values drift apart by the time between calls.
      const existing = engineRef.current
      if (existing !== null) {
        return firstInCueTimeRef.current
      }
      // Transition goes 'idle' → 'lead-in' (success) | 'failed' directly.
      try {
        // Synchronous pre-await capture — mirror of mutedRef posture. The session's
        // timbre is FROZEN here BEFORE the await so a cross-tab prefs mutation during
        // the gesture chain or during the engine construction cannot leak into the
        // active session.
        timbreRef.current = timbre
        // Capture bypassSilentMode synchronously BEFORE the await (mirrors timbreRef
        // posture). The value is frozen at start() call time; mid-session preference
        // toggles do NOT live-update.
        bypassSilentModeRef.current = bypassSilentMode
        const engine = await createAudioEngine({ timbre, bypassSilentMode })
        engineRef.current = engine
        // Swap the proxy source to the AC clock immediately after engineRef is assigned.
        // Subsequent clock.now() reads delegate to the AC's currentTime.
        proxyMemoRef.current.setSource(engine.clock)
        // Subscribe to the three clock channels. Subscriptions live alongside engineRef
        // and are torn down in stop() and at the top of reconstructEngine() before
        // engineRef is nulled. handleSuspend catches both natural statechange transitions
        // AND the synthetic clock.notifySuspended() fired by engine.resume()'s
        // InvalidStateError catch block (iOS Safari recovery). The subscriptions are
        // attached BEFORE any external code can call engine.resume(), preserving
        // byte-identical end-user behavior.
        const unsubResume = engine.clock.onResume(handleResume)
        const unsubSuspend = engine.clock.onSuspend(handleSuspend)
        const unsubClose = engine.clock.onClose(handleClose)
        const unsubForceTopUp = engine.clock.onResume(handleForceTopUp)
        clockUnsubsRef.current = [unsubResume, unsubSuspend, unsubClose, unsubForceTopUp]
        // Read mute from mutedRef so `start` does NOT depend on the React `muted`
        // state. The ref-mirror effect above keeps the ref in sync with the React
        // state before any subsequent callback observation; this drops `muted` from
        // `start`'s useCallback dep array and keeps the callback identity stable
        // across setMuted toggles.
        engine.setMuted(mutedRef.current)
        // Schedule the lead-in. Anchor at engine.clock.now() — the AC's currentTime
        // instant of lead-in start. The session-engine co-anchors via clock.now() for
        // the dual-clock alignment. audioNow reads through the SessionClock seam per
        // the clock contract.
        const startAudioTime = engine.clock.now()
        const firstInCueTime = engine.scheduleLeadIn(startAudioTime, plan)
        // Defense-in-depth for a closed engine — mirror stop()'s full teardown
        // sequence so no engine, AC, or clock subscriptions are leaked when
        // scheduleLeadIn returns null.
        if (firstInCueTime === null) {
          // Step 1: tear down clock subscriptions (mirror stop()).
          for (const off of clockUnsubsRef.current) off()
          clockUnsubsRef.current = []
          // Step 2: null engineRef (mirror stop()).
          engineRef.current = null
          // Step 3: revert proxy clock source to fresh wall clock (mirror stop()).
          proxyMemoRef.current.setSource(createWallSessionClock())
          // Step 4: clear cached refs (mirror stop() cache-clear).
          firstInCueTimeRef.current = null
          lastTopUpCuesRef.current = []
          // Step 5: propagate failure (preserved from prior code).
          setAudioAvailable(false)
          // Step 6: set audioStatus='unavailable' so MuteToggle.needsResume
          // does not read healthy on a dead audio path.
          setAudioStatus('unavailable')
          // Step 7: set status='failed' (preserved from prior code).
          setStatus('failed')
          // Step 8: close the engine (fire-and-forget — iOS gesture preservation
          // posture; no await here, engine is already known-bad).
          void engine.close()
          return null
        }
        firstInCueTimeRef.current = firstInCueTime
        setStatus('lead-in')
        setAudioAvailable(true)
        return firstInCueTime
      } catch (error) {
        // Visuals-only fallback. App.tsx still drives the visual countdown via
        // setTimeout/RAF chain. The error is intentionally swallowed (no raw stack
        // to user-facing surfaces).
        if (import.meta.env.DEV) {
          // Dev-only breadcrumb for triage of iOS-Safari construction failures from
          // real-device logs; never surfaces to production users.
          console.warn('[useAudioCues] start failed; falling back to visuals-only', error)
        }
        setAudioAvailable(false)
        setAudioStatus('unavailable') // set audioStatus='unavailable' so MuteToggle.needsResume does not read healthy on a dead audio path.
        setStatus('failed')
        return null
      }
    },
    [handleResume, handleSuspend, handleClose, handleForceTopUp],
  )

  const stop = useCallback(async (): Promise<void> => {
    // Invalidate any in-flight reconstruct.
    reconstructGenerationRef.current += 1
    // Tear down clock subscriptions BEFORE nulling engineRef. After this loop
    // runs, clockUnsubsRef is empty — a stray statechange event on the closing AC
    // will fire the clock's internal fan-out into the (now-empty) Set, a no-op.
    // Without this teardown the engineRef-null gate at the top of each handler
    // would short-circuit, but the unsub paths would still hold references to
    // closed-over setAudioStatus callbacks, leaking the subscription Sets across
    // mount/unmount cycles.
    for (const off of clockUnsubsRef.current) off()
    clockUnsubsRef.current = []
    // Null engineRef synchronously BEFORE awaiting close — otherwise a fast
    // start() arriving during the close window hits the defensive guard in
    // start() and returns from a closing AudioContext, leaving engineRef
    // pointing at a dead engine.
    const engine = engineRef.current
    engineRef.current = null
    // Revert the proxy source to a fresh wall clock so any post-stop clock.now()
    // reads return wall time (not a stale AC currentTime from a closed context,
    // which most browsers freeze at their last value — unspecified across
    // implementations). Uses a fresh createWallSessionClock() instance to avoid
    // any cross-session subscription state from the initial source.
    // NOTE: the unmount cleanup does NOT add a setProxyClockSource revert here —
    // the hook, useSessionEngine, and useBreathingSessionController all unmount
    // together, so no post-unmount clock.now() read can reach the proxy. This is
    // asymmetric with the NK path by design.
    proxyMemoRef.current.setSource(createWallSessionClock())
    firstInCueTimeRef.current = null // Clear cached anchor for the next start()
    lastTopUpCuesRef.current = [] // Clear cache so fast stop()→start() cannot replay stale cues into new engine.
    // Reset the audioStatus state machine + resume-attempt gate so the next session
    // starts clean (otherwise a residual 'needs-resume' from a prior suspend cycle
    // would carry into the new session's first render).
    visibilityResumeAttemptedRef.current = false
    setAudioStatus('ok')
    setStatus('idle')
    if (engine !== null) {
      await engine.close()
    }
  }, [])

  // Reconstruction path — close old engine + create new one + replay muted state
  // + signal re-anchor to App.tsx.
  //
  // iOS gesture preservation: the FIRST sync operation after the user-gesture click
  // MUST be `new AudioContext()` — iOS Safari consumes the gesture activation token
  // at the first `await`. Awaiting oldEngine.close() before the new AC ran the
  // construction outside gesture context, so the new AC came up in degraded
  // (interrupted) state (real-iPhone diagnostic captured this exact sequence:
  // new AC → 'running' → immediately 'interrupted' after gesture loss).
  // createAudioEngine() begins with `new AudioContext()` (sync) and only THEN
  // awaits resume() — that resume() runs inside the new AC's gesture context.
  // Old engine is closed AFTER the new AC is constructed (fire-and-forget;
  // close needs no gesture).
  const reconstructEngine = useCallback(async (): Promise<void> => {
    // Stamp this reconstruct's generation token.
    reconstructGenerationRef.current += 1
    const gen = reconstructGenerationRef.current
    const oldEngine = engineRef.current
    // Capture mute synchronously from the ref BEFORE any await. The value is
    // locked at this point in the gesture-attached chain so a mute toggle that
    // fires during the await does not race the replay. Reading from mutedRef
    // removes `muted` from this useCallback's dep array (callback identity stays
    // stable across setMuted toggles).
    const currentMuted = mutedRef.current
    // Capture session's original timbre BEFORE any await. Reconstruction NEVER
    // re-reads user prefs for timbre — the session's first-Start choice is
    // preserved across iOS visibility-suspend recovery. Mirror of `currentMuted`
    // posture immediately above.
    const currentTimbre = timbreRef.current
    // Replay bypassSilentMode from the ref captured in start() — mirror of the
    // currentTimbre capture above. Mid-session preference toggle does NOT
    // live-update: the engine is rebuilt with the same flag value that was active
    // at the original start() call.
    const currentBypassSilentMode = bypassSilentModeRef.current
    // Tear down OLD clock subscriptions BEFORE nulling engineRef — mirror of
    // stop()'s posture. Subscriptions never leak across reconstruction.
    for (const off of clockUnsubsRef.current) off()
    clockUnsubsRef.current = []
    // Synchronously null engineRef BEFORE awaiting — mirrors stop()'s posture so
    // a fast call into setMuted() during the window does not deref a closing AC.
    // DO NOT remove — the synchronous-null is preserved ON TOP of the generation
    // counter (both patterns address different races).
    engineRef.current = null
    firstInCueTimeRef.current = null
    // Clear lastTopUpCuesRef alongside the other ref resets (mirroring stop()'s
    // cache-clear). Without this, handleForceTopUp fires on the new engine's first
    // clock.onResume and replays cached cues with audioTimes from the OLD AC origin
    // — those times get clamped to audioNow + SAFE_LEAD_SEC on the new AC,
    // collapsing all N cues onto one instant (stacked strike). Clearing here
    // ensures the first onResume after reconstruction sees an empty cache and exits
    // early.
    lastTopUpCuesRef.current = []

    let newEngine: AudioEngine
    try {
      // Pass the session-captured timbre (NOT a fresh prefs read) to the new engine.
      // The session's first-Start choice flows through reconstruction.
      // Also passes the captured bypassSilentMode ref value.
      // External subscribers are wired AFTER construction via engine.clock.on*.
      newEngine = await createAudioEngine({ timbre: currentTimbre, bypassSilentMode: currentBypassSilentMode })
    } catch {
      // Terminal fallback: createAudioEngine threw. Fire-and-forget close the old
      // engine (gesture already consumed by the failed construction).
      if (oldEngine !== null) void oldEngine.close()
      setAudioStatus('unavailable')
      setAudioAvailable(false)
      return
    }

    // Bail if stop() / unmount / a newer reconstruct ran during the await.
    if (gen !== reconstructGenerationRef.current) {
      void newEngine.close()
      if (oldEngine !== null) void oldEngine.close()
      return
    }

    // Fire-and-forget close of the old AC — gesture token already used for new
    // AC construction; awaiting close would only delay the recovery.
    if (oldEngine !== null) void oldEngine.close()

    engineRef.current = newEngine
    // Swap the proxy source to the new engine's clock. After this call, clock.now()
    // delegates to the new AC's currentTime. This fires BEFORE the
    // onSessionClockReanchored and onReanchorRequired callbacks (ordering invariant).
    proxyMemoRef.current.setSource(newEngine.clock)
    // Re-subscribe the three handlers against the new engine's clock. The old
    // engine's subscriptions were torn down at the top of this callback (before
    // nulling engineRef). The new Set never inherits state from the old.
    const unsubResume = newEngine.clock.onResume(handleResume)
    const unsubSuspend = newEngine.clock.onSuspend(handleSuspend)
    const unsubClose = newEngine.clock.onClose(handleClose)
    const unsubForceTopUp = newEngine.clock.onResume(handleForceTopUp)
    clockUnsubsRef.current = [unsubResume, unsubSuspend, unsubClose, unsubForceTopUp]
    // Replay mute state synchronously so the new engine starts with the user's
    // chosen muted-ness — the React `muted` state was not reset by the close +
    // new-create cycle.
    newEngine.setMuted(currentMuted)
    // Re-anchor signal — the new AC's currentTime starts at 0, so the dual-anchor
    // (App.tsx audioAnchorRef) MUST be reset against the new origin or subsequent
    // scheduleNextCue calls will compute against a stale anchor and silently fail to
    // fire. App.tsx additionally subtracts session-elapsed time so boundary math
    // lands near the new AC.currentTime instead of in its distant future.
    // Repopulate firstInCueTimeRef against the reconstructed engine's origin.
    // reconstructEngine() nulled it above (alongside engineRef) so a
    // setMuted()/start() racing the await would not deref a stale anchor. Left
    // null, a post-reconstruction defensive start() call would return raw null,
    // which App.tsx aliases as "AC failed" — misreporting a healthy reconstructed
    // engine as broken. newEngine.clock.now() is the live anchor for the
    // reconstructed AC. Reads through the SessionClock seam; byte-identical to the
    // prior newEngine.now() (clock.now() returns the AC's currentTime).
    const reanchorAudioTime = newEngine.clock.now()
    firstInCueTimeRef.current = reanchorAudioTime
    // Fire onSessionClockReanchored BEFORE onReanchorRequired.
    // Ordering invariant: session-clock reanchor fires first (useSessionEngine
    // rewrites startedAtSec), then the audio-anchor reanchor
    // (useBreathingSessionController resets audioAnchorRef). This ensures session
    // elapsed is preserved before the audio scheduling path re-anchors.
    onSessionClockReanchoredRef.current?.(reanchorAudioTime)
    onReanchorRequiredRef.current?.(reanchorAudioTime)
    // The new AC starts in 'running' via the constructor path. Set audioStatus =
    // 'ok' synchronously — the clock's resume subscriber will also fire but may
    // race with the React render.
    visibilityResumeAttemptedRef.current = false
    setAudioStatus('ok')
    setAudioAvailable(true)
  }, [handleResume, handleSuspend, handleClose, handleForceTopUp])

  // Public resume() — invoked from the App.tsx mute-button click handler when
  // audioStatus === 'needs-resume'. The click IS a user gesture that we use to
  // acquire a fresh AudioContext via reconstruction.
  //
  // iOS Safari ground truth: plain engine.resume() returns audioCtx.state ===
  // 'running' on this device class even when the underlying iOS audio session is
  // dead — AC.currentTime never advances, scheduled cues never fire, beep test
  // silent. State is a lie; only a freshly-constructed AudioContext inside gesture
  // context restores audio output. The mechanism is "always reconstruct". The cost
  // is negligible (~tens of ms of AC construction + node setup) and the recovery is
  // reliable.
  const resume = useCallback(async (): Promise<void> => {
    // A consumer reading audioStatus === 'needs-resume' while the engine has
    // already been closed (engineRef.current === null) would otherwise hit a
    // silent no-op — the resume affordance becomes a dead button with no state
    // transition and no user feedback. Surface the terminal 'unavailable' status
    // so the UI drops the affordance and falls back to the visuals-only path
    // instead of stalling.
    if (engineRef.current === null) {
      setAudioStatus('unavailable')
      setAudioAvailable(false)
      return
    }
    await reconstructEngine()
  }, [reconstructEngine])

  const setMuted = useCallback((next: boolean): void => {
    setMutedState(next)
    // Fade-out tail when muting mid-cue is owned by the engine.
    engineRef.current?.setMuted(next)
  }, [])

  const notifyPhaseBoundary = useCallback(
    (args: { newPhase: 'in' | 'out'; audioTime: number; phaseDurationSec: number }): void => {
      engineRef.current?.scheduleNextCue(args)
    },
    [],
  )

  // Top-up facade — parallel to notifyPhaseBoundary; delegates to
  // engine.topUpLookahead({ cues }). Caches the cues array in lastTopUpCuesRef
  // for the clock.onResume force-top-up path (handleForceTopUp).
  // Defensive gate pattern: read engineRef into local `engine`; early-return when
  // null (matches handleResume and all other clock-subscriber callbacks).
  const topUpLookahead = useCallback(
    (cues: Array<{ audioTime: number; phaseDurationSec: number; kind: 'in' | 'out' }>): void => {
      const engine = engineRef.current
      if (engine === null) return
      lastTopUpCuesRef.current = cues // Cache AFTER null-gate so a pre-start call cannot poison the force-top-up cache
      engine.topUpLookahead({ cues })
    },
    [],
  )

  // Cancel-future-cues facade — parallel to topUpLookahead.
  // Stable-identity (empty deps array) matching topUpLookahead. The controller
  // calls this immediately before audioTopUpLookahead() on every
  // session.currentFrame change (cancel-then-reschedule per the SCHED-05 doctrine).
  // Defensive gate: reads engineRef into local `engine`; early-returns when null
  // (matches topUpLookahead and all other clock-subscriber callbacks).
  const cancelFutureCues = useCallback((): void => {
    const engine = engineRef.current
    if (engine === null) return
    engine.cancelFutureCues()
  }, [])

  const audioNow = useCallback((): number | null => {
    // Read through the SessionClock seam (engine.clock.now()) — byte-identical to
    // the prior engineRef.current?.now() (the AC's currentTime).
    return engineRef.current?.clock.now() ?? null
  }, [])

  const playEndChord = useCallback((): void => {
    engineRef.current?.playEndChord()
  }, [])

  const scheduleLeadInTicks = useCallback((startAudioTime: number): void => {
    engineRef.current?.scheduleLeadInTicks(startAudioTime)
  }, [])

  return {
    status,
    audioAvailable,
    muted,
    clock: proxyClock,
    start,
    stop,
    setMuted,
    notifyPhaseBoundary,
    topUpLookahead,
    cancelFutureCues,
    audioNow,
    playEndChord,
    scheduleLeadInTicks,
    audioStatus,
    resume,
  }
}
