// Stateful audio service composing the pure cueSynth module into a
// lifecycle-aware engine. Zero React imports.
//
// Owns:
//   - The single AudioContext (created from a user-gesture chain only).
//   - A single master GainNode all cues route through; mute ramps it.
//   - The lead-in scheduling primitive (3 ticks at +0/+1/+2 s + first In cue at +3 s).
//   - The boundary-driven scheduleNextCue dispatch (in → scheduleInCueForTimbre, out → scheduleOutCueForTimbre).
//   - close(): idempotent teardown that releases the system audio resources.
//
// Mute semantics (master gain):
//   - All cues route through a single master GainNode (masterGain → destination).
//   - setMuted(true): linear-ramps masterGain to 0 over 0.05 s (Safari-safe anchor
//     via cancelAndHoldAtTime, else cancelScheduledValues + setValueAtTime).
//   - setMuted(false): linear-ramps masterGain back to 1 over 0.05 s — INSTANT, with
//     no boundary wait. Unmute lands on whatever cue is currently playing.
//   - Cues KEEP being scheduled while muted (they play silently through gain=0), which
//     is what makes unmute instant.
//
// AC failure:
//   - createAudioEngine throws (rejects) when `new AudioContext()` throws. The caller
//     (useAudioCues) catches and falls back to visuals-only mode.

import type { BreathingPlan } from '../domain/breathingPlan'
import { scheduleInCueForTimbre, scheduleOutCueForTimbre, type CueHandle } from './cueSynth'
import { scheduleCountdownTick, scheduleEndChord } from './nkCueSynth'
import { createAudioSessionClock, type SessionClock, type Cue } from './sessionClock'
import { createSilentLoopBypass, type SilentLoopBypass } from './silentLoopBypass'
import type { TimbreId } from '../domain/settings'

export type AudioStatus = 'idle' | 'lead-in' | 'failed'

// Re-export SessionClock so consumers import it from audioEngine (the public engine boundary).
// The augmented factory return type `SessionClock & { notifySuspended(): void }` is NOT re-exported — notifySuspended is an engine-only escape hatch scoped to createAudioEngine's internal closure.
export type { SessionClock } from './sessionClock'

export interface AudioEngine {
  /** Schedule the 3-2-1 lead-in: ticks at startAudioTime + 0/+1/+2 s, first In cue at startAudioTime + 3 s.
   *  Returns the audioTime of the first In cue (= startAudioTime + 3), or null when the engine
   *  is closed — AUDIO-03. */
  scheduleLeadIn(startAudioTime: number, plan: BreathingPlan): number | null
  /** Schedule a ticks-only 3-2-1 lead-in (no first In cue): ticks at startAudioTime + 0/+1/+2 s.
   *  Used between rounds, where the next work block's first In cue is scheduled by the
   *  lookahead — not the lead-in. No-op when closed. */
  scheduleLeadInTicks(startAudioTime: number): void
  /** Notify of a phase boundary mid-session. Schedules the corresponding In or Out cue
   *  at the given audioTime (always — muted cues route silently through masterGain).
   *  `phaseDurationSec` is the length of the UPCOMING phase (in / out) in seconds;
   *  cueSynth uses it to stretch the bowl decay envelope so the cue stays audible
   *  through the entire phase at low BPM. The boundary scheduler in App.tsx derives
   *  this from plan.inhaleSec / plan.exhaleSec. */
  scheduleNextCue(args: { newPhase: 'in' | 'out'; audioTime: number; phaseDurationSec: number }): void
  /** Schedule the shared session-ending chord on this engine's AudioContext —
   *  the same sound the Navi Kriya completion plays. No-op when closed (muted cues
   *  route silently through masterGain). close() defers teardown until the chord rings. */
  playEndChord(): void
  /** Toggle mute. Linear-ramps the master gain to 0 (mute) or 1 (unmute)
   *  over 0.05 s. Instant; unmute lands on whatever cue is currently playing. */
  setMuted(muted: boolean): void
  /** Current mute state (mirrors what was last passed to setMuted). */
  readonly muted: boolean
  /** Capture the audioCtx.currentTime at this instant — App.tsx uses this as the t=0 anchor co-anchored with session.start(). */
  now(): number
  /** Close the AudioContext. Idempotent. Releases system audio resources. */
  close(): Promise<void>
  /** Resume the AudioContext if it is currently suspended (e.g., after iOS lock-screen auto-suspend).
   *  Idempotent: calling on an already-running AC resolves silently. Short-circuits on closed.
   *  Silently absorbs rejection. Used by useAudioCues' visibilitychange listener. */
  resume(): Promise<void>
  /** Live read of audioCtx.state. The hook's public resume() reads this AFTER
   *  `await engine.resume()` to decide whether reconstruction is required — React's audioStatus
   *  is closed-over by useCallback and may be stale within the same invocation. Reading
   *  audioCtx.state directly is the live truth. */
  readonly state: AudioContextState | 'interrupted'
  /** Dispatch a caller-supplied list of cues into the WebAudio scheduler.
   *  The caller pre-computes the cue list; the engine dispatches via the internal schedule()
   *  switch. Respects the closed guard and applies the callee-side SAFE_LEAD_SEC clamp
   *  on each cue's audioTime. Calls pruneExpiredCues() before dispatching to keep
   *  activeCues bounded. */
  topUpLookahead(args: { cues: Array<{ audioTime: number; phaseDurationSec: number; kind: 'in' | 'out' }> }): void
  /** Iterate activeCues snapshot, call cancel() on every cue with scheduledAt >
   *  audioCtx.currentTime, and remove those cues from activeCues. In-flight cues
   *  (scheduledAt <= now) are left to ring out naturally. Snapshot-iterate-then-mutate
   *  so Set mutation during iteration is safe. No-op when closed. */
  cancelFutureCues(): void
  /** SessionClock surface for external subscribers (onSuspend / onResume / onClose)
   *  and time reads (now / schedule). Constructed once at engine construction time.
   *
   *  The engine's internal reference is typed as the AUGMENTED factory return type
   *  `SessionClock & { notifySuspended(): void }` so the engine can invoke the
   *  synthetic-suspend escape hatch from the resume() InvalidStateError catch block —
   *  preserving the iOS Safari recovery path. The public `engine.clock` member is widened
   *  to `SessionClock` so external consumers cannot see `notifySuspended`. */
  readonly clock: SessionClock
}

export interface AudioEngineOptions {
  // External subscribers consume `engine.clock.onSuspend(cb)` /
  // `engine.clock.onResume(cb)` / `engine.clock.onClose(cb)`. The clock owns the single AC
  // statechange listener and fans suspend/resume/close to subscribers. The iOS Safari
  // InvalidStateError synthetic-suspend path is preserved via the engine-only escape hatch
  // on the augmented factory return type — see resume()'s catch block.
  /** Timbre captured at session start; engine never re-reads prefs.
   *  Caller passes the snapshot from useAudioCues.start(plan, timbre). No setter
   *  is exposed — capture-at-construction is the only mutation path. */
  timbre: TimbreId
  /** When false, skip silent-loop <audio> element construction entirely — no
   *  `new Audio(...)`, no `.play()` call, no teardown branch needed (null-guards in
   *  close() and the resume-reject catch already short-circuit when skipped).
   *  When true or undefined, the silent-loop element is constructed.
   *  Undefined coerces to true — omitting the field behaves identically to true
   *  (gate predicate is `!== false`, NOT `=== true`). */
  bypassSilentMode?: boolean | undefined
}

// Master-gain mute ramp duration (seconds).
const MUTE_RAMP_SEC = 0.05

// Lead-in: 3 ticks one second apart, then the first In cue at the start of the breath cycle.
// Exported as the single source of truth — App.tsx and useAudioCues.ts import these
// instead of redefining the same numbers locally.
export const LEAD_IN_TICK_INTERVAL_SEC = 1.0
export const LEAD_IN_DURATION_SEC = 3.0
export const LEAD_IN_TICK_INTERVAL_MS = LEAD_IN_TICK_INTERVAL_SEC * 1000
export const LEAD_IN_DURATION_MS = LEAD_IN_DURATION_SEC * 1000
/** Minimum scheduling lead ahead of audioCtx.currentTime for any cue dispatch.
 *  Exported as single source of truth — App.tsx imports this symbol for the caller-side
 *  clamp; audioEngine.scheduleNextCue uses it for the callee-side clamp.
 *  No duplicated literals; both clamp sites derive from this constant. */
export const SAFE_LEAD_SEC = 0.005

/** Lookahead window in seconds. Locked at 6 s — the middle of the 5–10 s recommended
 *  band. At any BPM ≥ 3 the seconds budget alone keeps ≥ 1 cue queued through a brief
 *  tab switch; the LOOKAHEAD_MIN_CUES floor handles the low-BPM (≤ 3 BPM) tail. */
export const LOOKAHEAD_WINDOW_SEC = 6 as const

/** Minimum cue queue depth regardless of BPM. Always keeps the next cue + cue-after
 *  queued (next + one-ahead). At 1 BPM (60 s/breath) the floor pre-schedules ~120 s
 *  of audio; cancel cost on a settings change = at most 2 oscillator stops + node
 *  disconnects. */
export const LOOKAHEAD_MIN_CUES = 2 as const

/** Create a new AudioContext + engine. MUST be called from a user-gesture path.
 *  Throws (rejects) if AudioContext construction fails — caller handles the fallback. */
export async function createAudioEngine(opts: AudioEngineOptions): Promise<AudioEngine> {
  // AudioContext is constructed here, invoked synchronously from the Start session click
  // handler. The browser autoplay policy MUST see a fresh user-gesture chain or the AC
  // will start in 'suspended'.
  const audioCtx = new AudioContext()

  // Single master GainNode all cues route through. mute ramps it to 0,
  // unmute ramps it to 1 (over MUTE_RAMP_SEC). Cues schedule silently while muted.
  const masterGain = audioCtx.createGain()
  masterGain.gain.value = 1
  masterGain.connect(audioCtx.destination)

  // The clock wraps the AC's 'statechange' listener and fans suspend/resume/close
  // to subscribers via the SessionClock interface. Clock construction is placed AFTER
  // the internal `schedule` function is defined so `scheduleImpl` can be plumbed at
  // construction time (no post-hoc readonly reassignment), and BEFORE the `engine`
  // object literal that references `clock`.

  // Silent looping <audio> element constructed SYNCHRONOUSLY on the gesture head,
  // BEFORE any await (the createSilentLoopBypass gesture-token constraint — see that
  // module). Do NOT move this past the `await audioCtx.resume()` below.
  //
  // Gate: predicate is `!== false` (NOT `=== true`) so undefined coerces to
  // "construct" — callers that omit the field get the silent-loop element. When
  // bypassSilentMode === false, silentBypass stays null and the `?.teardown()`
  // null-guards in close() and the resume-reject catch short-circuit cleanly.
  const silentBypass: SilentLoopBypass | null =
    opts.bypassSilentMode !== false ? createSilentLoopBypass() : null

  // Chrome can occasionally hand back an AC in 'suspended' even from a gesture chain
  // (race conditions during page bootstrap); resume immediately so currentTime advances.
  // If resume() rejects (e.g., the user agent vetoed autoplay between construction and
  // the resume attempt), close the AC before re-throwing — otherwise the AC leaks
  // (browsers cap concurrent ACs at ~6).
  // The silent-loop element was constructed above on the gesture head and cannot be
  // reached through engine.close() if we never return an engine handle. When resume()
  // rejects, tear it down BEFORE closing the AC.
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume()
    } catch (err) {
      silentBypass?.teardown()
      await audioCtx.close().catch(() => undefined)
      throw err
    }
  }

  // AudioContextState widened to include WebKit's 'interrupted' extension (iOS Safari).
  // The cast documents intent; centralising it here keeps the eslint-disable in one
  // place instead of repeated at every read site.
  type ExtendedAudioContextState = AudioContextState | 'interrupted'
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const readState = (): ExtendedAudioContextState => audioCtx.state as ExtendedAudioContextState

  // The clock owns the single AC statechange listener and fans suspend/resume/close
  // to external subscribers (useAudioCues consumes them via engine.clock.on*). Engine
  // internals do not observe statechange events directly; they act in their own
  // synchronous lifecycle methods (close(), resume()). The InvalidStateError
  // synthetic-suspend path inside resume()'s catch uses the engine-only escape hatch
  // on the augmented clock type — it does NOT need its own listener.

  // Track ALL in-flight cues (lead-in ticks + In/Out bowls). Mute mid-lead-in must
  // silence the remaining ticks too — only tracking one handle would leave the other
  // ticks audible after the user clicks Mute.
  const activeCues = new Set<CueHandle>()
  let muted = false // default false (audio ON on first visit)
  // Capture timbre once at construction. Immutable for this engine's lifetime —
  // no setter exposed. scheduleLeadIn + scheduleNextCue forward this value to
  // scheduleInCueForTimbre / scheduleOutCueForTimbre.
  const sessionTimbre: TimbreId = opts.timbre
  let closed = false
  // Audio-clock time at which the end-chord tail finishes. close() defers the
  // AudioContext teardown until this instant so the session-ending chord
  // (playEndChord) is never cut off. 0 = no end chord scheduled.
  let endChordTailUntil = 0

  // Drop cues whose tails have already finished (cleanupAt < now). Keeps the Set
  // bounded over a long session and avoids re-fading already-silent envelopes.
  //
  // The 100 ms slack between actual 'ended' fire time (stopAt = when + 5τ + 0.1s)
  // and cleanupAt (stopAt + 0.1s) is intentional. During that window the cue is
  // still in activeCues but its 'ended' listener has already disconnected the
  // envelope from upstream + destination. setMuted ramps on these phantom
  // envelopes are harmless dead work; close() disconnects are wrapped in
  // try/catch for the same reason. Pruning strictly on cleanupAt < now lets us
  // avoid threading a per-handle 'done' flag through every schedule* primitive.
  function pruneExpiredCues(): void {
    const now = audioCtx.currentTime
    // Iterate a snapshot, not the live Set. Deleting from a Set during
    // a for...of over that same Set is defined for the current element but
    // fragile, and outright unsafe if this loop body is ever extended to add().
    // The spread copy decouples iteration from mutation.
    for (const cue of [...activeCues]) {
      if (cue.cleanupAt < now) activeCues.delete(cue)
    }
  }

  // Internal dispatch from a typed Cue value to the per-cue primitives in
  // cueSynth.ts / nkCueSynth.ts. The public methods (scheduleLeadIn,
  // scheduleNextCue, playEndChord) are thin facades over this function. The closed
  // guard lives in the facades (so each facade can choose its own behavior, e.g.,
  // scheduleNextCue clamps the time, scheduleLeadIn returns firstInCueTime).
  // There is NO muted guard — cues always schedule and route through masterGain
  // (silent at gain=0). This function assumes the facade has already gated closed;
  // do NOT add closed/muted checks here.
  //
  // The Cue discriminated union is closed — every kind has a switch arm. TypeScript
  // exhaustiveness enforces this at compile time.
  function schedule(when: number, cue: Cue): void {
    switch (cue.kind) {
      case 'lead-in-tick':
        activeCues.add(scheduleCountdownTick(audioCtx, when, masterGain, sessionTimbre))
        return
      // Timbre is NOT a cue field — sessionTimbre (captured at construction) is the
      // source of truth at the engine layer.
      case 'in':
        activeCues.add(scheduleInCueForTimbre(audioCtx, when, masterGain, sessionTimbre, cue.phaseDurationSec))
        return
      case 'out':
        activeCues.add(scheduleOutCueForTimbre(audioCtx, when, masterGain, sessionTimbre, cue.phaseDurationSec))
        return
      case 'end-chord': {
        const c = scheduleEndChord(audioCtx, when, masterGain, sessionTimbre)
        activeCues.add(c)
        // Record the tail end so close() can defer teardown until the chord rings out.
        // Take the max in case of double-dispatch — the second call's tail must not
        // retreat below an earlier-scheduled chord still ringing.
        endChordTailUntil = Math.max(endChordTailUntil, c.cleanupAt)
        return
      }
    }
  }

  // The clock wraps the AC. scheduleImpl is plumbed at construction (NOT post-hoc
  // reassignment). The local clock reference is typed as the AUGMENTED factory return
  // type `SessionClock & { notifySuspended(): void }` so the InvalidStateError catch
  // in resume() can call clock.notifySuspended(). The engine.clock public member is
  // widened to SessionClock at the assignment boundary — external consumers cannot
  // call notifySuspended.
  //
  // This is the HRV AC clock; useNaviKriyaAudio constructs its own SEPARATE clock
  // for the NK AC — they MUST NOT be conflated.
  const clock: SessionClock & { notifySuspended(): void } = createAudioSessionClock(audioCtx, schedule)

  const engine: AudioEngine = {
    scheduleLeadIn(startAudioTime: number, plan: BreathingPlan): number | null {
      const firstInCueTime = startAudioTime + LEAD_IN_DURATION_SEC
      if (closed) return null // closed engine has no meaningful projection.
      // Cues schedule even while muted (they play silently through masterGain=0).

      // Facade over the internal schedule(when, cue) dispatch.
      // 3 ticks at +0/+1/+2 + first In cue at +3. Track each so mid-lead-in mute
      // can fade them out — schedule()'s switch arms do the activeCues.add
      // bookkeeping. The countdown beep is the shared scheduleCountdownTick —
      // the same beep the Navi Kriya countdown uses — and honours the session timbre.
      schedule(startAudioTime + 0 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
      schedule(startAudioTime + 1 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
      schedule(startAudioTime + 2 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
      // First In cue at +3. Pass the upcoming In-phase duration so the decay envelope
      // stretches with the phase length at low BPM (App.tsx boundary scheduler does the
      // same for every subsequent cue). plan.inhaleSec is seconds-shaped at the source —
      // no `/1000` conversion. Timbre is not a cue field — schedule() resolves it
      // from the closed-over sessionTimbre.
      schedule(firstInCueTime, { kind: 'in', phaseDurationSec: plan.inhaleSec })

      return firstInCueTime
    },

    scheduleLeadInTicks(startAudioTime: number): void {
      if (closed) return
      // Ticks only — the next block's first In cue comes from the lookahead, so
      // scheduling it here too would double-strike the boundary.
      schedule(startAudioTime + 0 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
      schedule(startAudioTime + 1 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
      schedule(startAudioTime + 2 * LEAD_IN_TICK_INTERVAL_SEC, { kind: 'lead-in-tick' })
    },

    scheduleNextCue({ newPhase, audioTime, phaseDurationSec }: { newPhase: 'in' | 'out'; audioTime: number; phaseDurationSec: number }): void {
      if (closed) return
      // Schedule even while muted (silent through masterGain=0).
      pruneExpiredCues()
      // Callee-side clamp: any audioTime in the past is clamped to currentTime + SAFE_LEAD_SEC.
      const clampedAudioTime = Math.max(audioTime, audioCtx.currentTime + SAFE_LEAD_SEC)
      // Facade over schedule(). phaseDurationSec flows into the 'in' / 'out' cue payload;
      // schedule()'s arm forwards it to scheduleInCueForTimbre / scheduleOutCueForTimbre.
      schedule(clampedAudioTime, { kind: newPhase, phaseDurationSec })
    },

    // Lookahead dispatch facade. Same posture as scheduleNextCue: closed guard at top,
    // pruneExpiredCues() before dispatch, callee-side SAFE_LEAD_SEC clamp per cue.
    // The cue list is pre-computed by the caller; this method only dispatches via the
    // internal schedule() switch (no walk logic here).
    topUpLookahead(args: { cues: Array<{ audioTime: number; phaseDurationSec: number; kind: 'in' | 'out' }> }): void {
      if (closed) return
      // Schedule even while muted (silent through masterGain=0).
      pruneExpiredCues()
      const nowSec = audioCtx.currentTime
      for (const cue of args.cues) {
        // Engine-layer dedup: the rAF top-up re-walks the boundary it is currently
        // crossing; that boundary's IN-FLIGHT cue survived cancelFutureCues
        // (scheduledAt <= now), so re-scheduling it lands a second strike ~SAFE_LEAD_SEC
        // after the first — an audible double-tick. Skip any requested cue whose UNCLAMPED
        // audioTime is within SAFE_LEAD_SEC of an already-IN-FLIGHT cue's scheduledAt.
        // Compare the unclamped time so a boundary a few ms in the past still matches its
        // in-flight handle. Scope to in-flight (scheduledAt <= now) ONLY: future queued cues
        // are the caller's cancel-then-reschedule responsibility — deduping them could leave
        // a stale old-settings cue in place after a BPM/timbre change. Distinct breathing
        // cues are always >> SAFE_LEAD_SEC apart, so this never drops a genuinely separate cue.
        let isInFlightDuplicate = false
        for (const active of activeCues) {
          if (active.scheduledAt <= nowSec && Math.abs(active.scheduledAt - cue.audioTime) < SAFE_LEAD_SEC) {
            isInFlightDuplicate = true
            break
          }
        }
        if (isInFlightDuplicate) continue
        // Callee-side clamp — identical posture to scheduleNextCue.
        const clampedAudioTime = Math.max(cue.audioTime, audioCtx.currentTime + SAFE_LEAD_SEC)
        // schedule() adds the returned handle to activeCues internally.
        // Timbre is resolved from the closed-over sessionTimbre, not the cue.
        schedule(clampedAudioTime, { kind: cue.kind, phaseDurationSec: cue.phaseDurationSec })
      }
    },

    // Future-cue cancellation helper. Snapshot-iterate activeCues (spread copy decouples
    // iteration from mutation). For each cue with scheduledAt > now: call cancel() +
    // remove from activeCues. In-flight cues (scheduledAt <= now) ring out naturally.
    cancelFutureCues(): void {
      if (closed) return
      const now = audioCtx.currentTime
      // Snapshot-iterate-then-mutate: same pattern as pruneExpiredCues.
      // cancel() stops oscillators + disconnects all nodes.
      for (const cue of [...activeCues]) {
        if (cue.scheduledAt > now) {
          cue.cancel()
          activeCues.delete(cue)
        }
      }
    },

    playEndChord(): void {
      if (closed) return
      // Schedule even while muted (silent through masterGain=0).
      // Facade over schedule(). The endChordTailUntil Math.max bookkeeping is inside
      // schedule()'s 'end-chord' arm — close() defers teardown until the tail rings out.
      const when = audioCtx.currentTime + SAFE_LEAD_SEC
      schedule(when, { kind: 'end-chord' })
    },

    setMuted(next: boolean): void {
      muted = next
      if (closed) return
      // Ramp the single master gain — instant, no boundary wait. Cues keep scheduling
      // through masterGain (silent at gain=0), so unmute lands on whatever cue is
      // currently playing. Anchor the current value first (Safari-safe), then
      // linear-ramp to the target over MUTE_RAMP_SEC.
      const gainParam = masterGain.gain
      const now = audioCtx.currentTime
      if (typeof gainParam.cancelAndHoldAtTime === 'function') {
        gainParam.cancelAndHoldAtTime(now)
      } else {
        gainParam.cancelScheduledValues(now)
        gainParam.setValueAtTime(gainParam.value, now)
      }
      gainParam.linearRampToValueAtTime(next ? 0 : 1, now + MUTE_RAMP_SEC)
    },

    get muted(): boolean {
      return muted
    },

    now(): number {
      return audioCtx.currentTime
    },

    async close(): Promise<void> {
      if (closed) return
      closed = true
      // No engine-side statechange listener to remove. The clock's listener is owned by
      // the clock; its lifecycle is independent (the AC's close fires 'closed' on the
      // clock's listener which fans to closeSubscribers, then handleClose in useAudioCues
      // sets audioStatus to 'unavailable').
      // If playEndChord scheduled a session-ending chord, defer teardown until
      // its tail rings out — otherwise the disconnect loop below would sever
      // the chord mid-ring. Skipped entirely when no end chord was scheduled
      // (endChordTailUntil = 0), so the manual-end / open-ended paths close
      // immediately as before.
      //
      // setTimeout(wallclock) is used here even though endChordTailUntil is on
      // the audio clock: when the tab is foregrounded the two clocks advance in
      // lockstep within human-perceptual tolerance, and when the tab is
      // backgrounded both throttle together (Chrome throttles setTimeout AND
      // auto-suspends the AC, Safari pauses both). The wait drifting longer in
      // a hidden tab is acceptable because the user is not listening; the wait
      // ending early is what we cannot tolerate, and that mode requires
      // setTimeout to fire while currentTime is paused, which no current
      // browser does.
      const tailRemainingSec = endChordTailUntil - audioCtx.currentTime
      if (tailRemainingSec > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, tailRemainingSec * 1000)
        })
      }
      // Silent-loop element teardown. Idempotent; no-op when bypass was skipped.
      // Second close() short-circuits at the top of close() before this runs.
      silentBypass?.teardown()
      // Node cleanup is otherwise driven by the oscillator 'ended' event. The Web Audio
      // spec does NOT guarantee 'ended' fires for an oscillator whose stopAt is still
      // in the future when audioCtx.close() runs — so a cue scheduled close to close()
      // could leak its node chain. Before closing the context, explicitly disconnect
      // every in-flight cue's envelope (the GainNode wired to destination — the only
      // node the CueHandle exposes; tearing this edge severs the chain from the graph
      // output) and clear the Set so the handles become GC-able.
      for (const cue of [...activeCues]) {
        try { cue.envelope.disconnect() } catch { /* silent — node may already be disconnected */ }
      }
      activeCues.clear()
      // Disconnect the master gain from destination as part of teardown.
      try { masterGain.disconnect() } catch { /* silent — node may already be disconnected */ }
      // In-flight cue tails (up to ~5× decayTimeConstant) ring out via the audio thread's
      // already-scheduled gain ramps. We close immediately and trust those ramps to drain
      // naturally. Closing AudioContext releases the system audio resources.
      await audioCtx.close()
    },

    async resume(): Promise<void> {
      if (closed) return
      try {
        await audioCtx.resume()
      } catch (err) {
        // iOS Safari raises `DOMException { name: 'InvalidStateError' }` when resume()
        // is invoked from a non-gesture context (the visibilitychange listener qualifies
        // as non-gesture on iOS Safari). Surface THIS error class via the state-change
        // path so the hook can transition to 'needs-resume' and show the user-tappable
        // affordance. All other errors are silently absorbed — the session continues on
        // visuals only.
        //
        // When resume() rejects with InvalidStateError the AC was ALREADY 'suspended'
        // before the call and stays 'suspended' after — no natural statechange event fires.
        // We use the engine-only synthetic-suspend escape hatch on the augmented factory
        // return type; it synchronously fans the suspended event to suspendSubscribers via
        // the same path as a natural statechange. This lets useAudioCues' handleSuspend
        // subscriber set audioStatus to 'needs-resume' as it would on a real suspend.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if ((err as DOMException)?.name === 'InvalidStateError') {
          clock.notifySuspended()
        }
        // Else: silent. The session continues on visuals only.
      }
    },

    get state(): AudioContextState | 'interrupted' {
      return readState()
    },

    // Expose the SessionClock surface. The assignment widens the augmented factory
    // return type to `SessionClock` — external consumers cannot call `notifySuspended`.
    clock,
  }

  return engine
}
