// Navi Kriya OM-counting engine hook.
// Audio is injected as callbacks so this hook is audio-agnostic and fully
// testable with fake timers and vi.fn() stubs.
//
// STALE-CLOSURE INVARIANT: stepOm reads ONLY eng.current and callback refs. It
// never reads closed-over React state. All per-tick values (count, phase, omSec,
// cueOn, ...) come from the mutable NKEngineRecord ref.
//
// Time is read exclusively via the injected SessionClock — zero performance.now()
// references in this file. The clock parameter makes elapsed-stats math
// independent of the time source; the caller-supplied clock can be rebased onto
// audioCtx.currentTime without touching this file.
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SessionClock } from '../audio/audioEngine'
import type { NaviKriyaSettings } from '../domain/naviKriyaSettings'
import {
  NK_LAST_OM_HOLD_MULTIPLIER,
  NK_LEAD_SEC,
} from '../domain/naviKriyaSession'

export { NK_LAST_OM_HOLD_MULTIPLIER, NK_LEAD_SEC } from '../domain/naviKriyaSession'
export { NK_OM_SECONDS } from '../domain/naviKriyaSettings'

// ---------------------------------------------------------------------------
// Types

interface NKEngineRecord {
  phase: 'front' | 'back' | 'done'
  round: number
  count: number
  frontCount: number
  backCount: number        // = frontCount / 4, computed once at start()
  rounds: number
  omSec: number            // settings.omSeconds (seconds-shaped)
  cueOn: boolean           // mirrors perOmCue; mutable for live toggle via toggleCue()
  startedAtSec: number     // clock.now() at start — for elapsed stats (seconds-shaped)
  completedRounds: number  // fully-completed rounds (for early-end stats)
  // Delay (seconds) of the currently-pending step timer. Markers schedule the
  // next step with NK_LEAD_SEC; per-OM steps use omSec. Recorded so schedule()
  // always has the current pending delay for reference. (Seconds-shaped; the
  // only ms-shaped value in this file is the setTimeout boundary multiplication
  // inside schedule().)
  pendingDelaySec: number
  // Armed when an OM reaches the phase target. The phase transition does NOT run
  // in the same tick that counted the last OM — that would flash the final count
  // for 0 ms (back's single OM would never show "1"). Instead the last OM runs
  // for its full omSec like any other, and the NEXT stepOm — seeing this flag —
  // performs the transition.
  pendingTransition: boolean
}

export interface NKAudioCallbacks {
  frontMarker(): void
  backMarker(): void
  tick(): void
  // Distinct cue for the LAST OM of a count (front's frontCount-th, back's
  // backCount-th) so the practitioner can anticipate the phase switch. Optional:
  // when the audio layer supplies none, the engine falls back to tick().
  finalTick?(): void
  endCue(): void
}

export type NKOnComplete = (result: {
  completedRounds: number
  elapsedSec: number
  isComplete: boolean
}) => void

export interface NKEngineApi {
  nkPhase: 'idle' | 'front' | 'back' | 'done'
  nkRound: number
  nkCount: number
  nkRunning: boolean
  start(this: void, settings: NaviKriyaSettings, callbacks: NKAudioCallbacks, onComplete: NKOnComplete): void
  end(this: void): void
  toggleCue(this: void, on: boolean): void
}

// ---------------------------------------------------------------------------
// Hook

export function useNKEngine(clock: SessionClock): NKEngineApi {
  // Display state — causes React re-renders
  const [nkPhase, setNkPhase]     = useState<'idle' | 'front' | 'back' | 'done'>('idle')
  const [nkRound, setNkRound]     = useState(1)
  const [nkCount, setNkCount]     = useState(0)
  const [nkRunning, setNkRunning] = useState(false)

  // Mutable engine record — NOT React state (no re-render on mutation)
  const eng   = useRef<NKEngineRecord | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepOmRef = useRef<() => void>(() => undefined)

  // Callback refs — captured at start(), read inside stepOm to avoid stale closures
  const cbsRef        = useRef<NKAudioCallbacks | null>(null)
  const onCompleteRef = useRef<NKOnComplete | null>(null)

  // schedule: internal helper used inside stepOm and other stable callbacks.
  // Accepts a seconds-shaped delay; records it on the engine record and converts
  // to ms only at the setTimeout boundary.
  const schedule = useCallback((delaySec: number) => {
    if (timer.current !== null) clearTimeout(timer.current)
    if (eng.current) eng.current.pendingDelaySec = delaySec
    // setTimeout takes ms; engine record is seconds-shaped.
    // Multiply at this boundary only.
    timer.current = setTimeout(() => { stepOmRef.current() }, delaySec * 1000)
  }, [])

  // stepOm: the per-OM callback. Reads ONLY eng.current and callback refs —
  // never closed-over React state (stale-closure invariant — see header comment).
  const stepOm = useCallback(function stepOm() {
    const e = eng.current
    if (!e) return
    const cbs = cbsRef.current

    // pendingTransition means the previous OM was the last of its phase and has
    // now had its full omSec of display time. Perform the phase change — do NOT
    // count another OM this tick.
    if (e.pendingTransition) {
      e.pendingTransition = false
      if (e.phase === 'front') {
        e.phase = 'back'
        e.count = 0
        setNkPhase('back')
        setNkCount(0)
        if (cbs) cbs.backMarker()
        schedule(NK_LEAD_SEC)
      } else if (e.round < e.rounds) {
        // Back phase complete — advance to next round
        e.completedRounds += 1
        e.round += 1
        e.phase = 'front'
        e.count = 0
        setNkRound(e.round)
        setNkPhase('front')
        setNkCount(0)
        if (cbs) cbs.frontMarker()
        schedule(NK_LEAD_SEC)
      } else {
        // Final back phase complete — session done
        e.completedRounds += 1
        e.phase = 'done'
        setNkPhase('done')
        setNkRunning(false)
        if (cbs) cbs.endCue()
        const elapsedSec = clock.now() - e.startedAtSec
        if (onCompleteRef.current) {
          onCompleteRef.current({
            completedRounds: e.completedRounds,
            elapsedSec,
            isComplete: true,
          })
        }
      }
      return
    }

    e.count += 1
    setNkCount(e.count)

    const target = e.phase === 'front' ? e.frontCount : e.backCount
    const isFinalOm = e.count >= target

    if (e.cueOn && cbs) {
      // Last OM of the count gets a distinct cue (a fifth above) so the yogi can
      // anticipate the phase switch; every other OM gets the plain tick. Falls
      // back to tick() when the audio layer supplies no finalTick.
      if (isFinalOm && cbs.finalTick) cbs.finalTick()
      else cbs.tick()
    }

    if (isFinalOm) {
      // Last OM of the phase: arm pendingTransition so the NEXT stepOm changes
      // phase instead of counting (the last count is shown, not flashed). It
      // also holds longer than a normal OM (NK_LAST_OM_HOLD_MULTIPLIER × omSec)
      // for a smoother settle into the next phase.
      e.pendingTransition = true
      schedule(e.omSec * NK_LAST_OM_HOLD_MULTIPLIER)
    } else {
      schedule(e.omSec)
    }
  }, [schedule, clock])

  useEffect(() => {
    stepOmRef.current = stepOm
  }, [stepOm])

  const start = useCallback((
    settings: NaviKriyaSettings,
    callbacks: NKAudioCallbacks,
    onComplete: NKOnComplete,
  ) => {
    // Clear any existing timer
    if (timer.current !== null) clearTimeout(timer.current)

    const backCount = settings.frontCount / 4

    eng.current = {
      phase: 'front',
      round: 1,
      count: 0,
      frontCount: settings.frontCount,
      backCount,
      rounds: settings.rounds,
      omSec: settings.omSeconds,
      cueOn: settings.perOmCue,
      startedAtSec: clock.now(),
      completedRounds: 0,
      // start() schedules the first step with NK_LEAD_SEC.
      pendingDelaySec: NK_LEAD_SEC,
      pendingTransition: false,
    }

    // Capture callbacks in refs so stepOm reads them without stale closure
    cbsRef.current = callbacks
    onCompleteRef.current = onComplete

    setNkPhase('front')
    setNkRound(1)
    setNkCount(0)
    setNkRunning(true)

    callbacks.frontMarker()
    schedule(NK_LEAD_SEC)
  }, [schedule, clock])

  const end = useCallback(() => {
    const e = eng.current
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }

    // Fire onComplete BEFORE resetting state (with current stats)
    if (e && onCompleteRef.current) {
      onCompleteRef.current({
        completedRounds: e.completedRounds,
        elapsedSec: clock.now() - e.startedAtSec,
        isComplete: false,
      })
    }

    eng.current = null
    cbsRef.current = null
    onCompleteRef.current = null

    setNkPhase('idle')
    setNkCount(0)
    setNkRound(1)
    setNkRunning(false)
  }, [clock])

  const toggleCue = useCallback((on: boolean) => {
    if (eng.current) {
      eng.current.cueOn = on
    }
  }, [])

  // Cleanup cancels the pending timer on unmount to prevent stale callbacks.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return {
    nkPhase,
    nkRound,
    nkCount,
    nkRunning,
    start,
    end,
    toggleCue,
  }
}
