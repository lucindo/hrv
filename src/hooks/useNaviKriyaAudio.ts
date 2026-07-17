import { useCallback, useEffect, useMemo, useRef } from 'react'

import { SAFE_LEAD_SEC } from '../audio/audioEngine'
import {
  END_CHORD_RINGOUT_SEC,
  scheduleCountdownTick,
  scheduleEndChord,
  scheduleNKBackMarker,
  scheduleNKFinalTick,
  scheduleNKFrontMarker,
  scheduleNKTick,
} from '../audio/nkCueSynth'
import { createAudioSessionClock, createWallSessionClock, type SessionClock } from '../audio/sessionClock'
import { createSilentLoopBypass, type SilentLoopBypass } from '../audio/silentLoopBypass'
import { createSwappableSessionClock } from '../audio/swappableSessionClock'
import type { TimbreId } from '../domain/settings'
import type { NKAudioCallbacks } from './useNKEngine'

const END_CHORD_RINGOUT_MS =
  Math.ceil((SAFE_LEAD_SEC + END_CHORD_RINGOUT_SEC) * 1000) + 250

const NOOP_AUDIO_CALLBACKS: NKAudioCallbacks = {
  frontMarker: () => undefined,
  backMarker: () => undefined,
  tick: () => undefined,
  endCue: () => undefined,
}

export interface NaviKriyaAudioSession {
  callbacks: NKAudioCallbacks
  countdownTick(this: void): void
}

export interface NaviKriyaAudioController {
  begin(this: void, getTimbre: () => TimbreId): NaviKriyaAudioSession
  close(this: void): void
  closeAfterEndCue(this: void): void
  /**
   * Stable proxy clock reference (proxy identity invariant: the same
   * `SessionClock` object reference is returned for the lifetime of the hook
   * instance, regardless of how many begin/close cycles have occurred).
   *
   * Swap / revert posture:
   *   - Pre-begin: delegates to a `createWallSessionClock()` source.
   *   - After `begin()` (AC construction succeeds): delegates to
   *     `createAudioSessionClock(audioCtx)` — AC-backed stats reads.
   *   - After `close()` / `closeAfterEndCue()` / unmount: reverts to a fresh
   *     `createWallSessionClock()` source so post-end stats reads return a
   *     sensible wall-clock value instead of a frozen closed-AC timestamp.
   *
   * NK lifecycle is `begin()` → `close()` only. There is no in-session AC
   * reconstruction path and therefore no `onSessionClockReanchored` callback
   * or `reanchorSessionClock` method on the NK path. The proxy is swapped only
   * at `begin()` and reverted at close.
   */
  clock: SessionClock
}

function closeAudioContext(audioCtx: AudioContext): void {
  void audioCtx.close().catch(() => {
    // Best-effort teardown: browsers may reject close() after an external state change.
  })
}

function createOptionalAudioContext(): AudioContext | null {
  try {
    return new AudioContext()
  } catch {
    // Audio is optional for Navi Kriya; the visual/timer session continues with no-op cues.
    return null
  }
}

export function useNaviKriyaAudio(
  muted: boolean,
  bypassSilentMode = true,
): NaviKriyaAudioController {
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Silent-loop bypass handle for the active NK AudioContext (iOS hardware
  // silent-switch). Constructed on the gesture head in begin() when enabled; torn
  // down alongside the AC in close/closeAfterEndCue/unmount. Null when disabled.
  const silentBypassRef = useRef<SilentLoopBypass | null>(null)

  // Stable proxy clock reference — created exactly once per hook instance via
  // useMemo (empty deps). The proxy always starts delegating to a wall clock;
  // proxy.setSource swaps it to the AC clock inside begin() and reverts to a
  // fresh wall clock in close() / closeAfterEndCue() / unmount cleanup.
  // Reason: proxy reference is kept (not destructured) to satisfy
  // @typescript-eslint/unbound-method — accessing proxy.setSource via the
  // object reference avoids the unintentional-`this` warning.
  const proxy = useMemo(
    () => createSwappableSessionClock(createWallSessionClock()),
    [],
  )

  const mutedRef = useRef<boolean>(muted)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  const begin = useCallback((getTimbre: () => TimbreId): NaviKriyaAudioSession => {
    const audioCtx = createOptionalAudioContext()
    audioCtxRef.current = audioCtx

    if (audioCtx === null) {
      return {
        callbacks: NOOP_AUDIO_CALLBACKS,
        countdownTick: () => undefined,
      }
    }

    // Silent-loop bypass — constructed SYNCHRONOUSLY here on the gesture head (begin()
    // runs inside the Start-click handler, no await) so iOS Safari coerces the audio
    // session to 'playback'. Default-true param mirrors createAudioEngine's
    // undefined-coerces-to-construct posture.
    if (bypassSilentMode) {
      silentBypassRef.current = createSilentLoopBypass()
    }

    // Wrap the AC immediately after construction. The audioCtx is the source of
    // truth; the clock is the typed surface for time reads (audioCtx.currentTime
    // is no longer read directly by this caller). clock.now() returns
    // audioCtx.currentTime — byte-identical to the pre-refactor read. This is
    // the NK clock, NOT the engine clock; they wrap distinct AudioContexts.
    const clock = createAudioSessionClock(audioCtx)
    // Proxy now delegates to the audio clock so external consumers (useNKEngine
    // via naviAudio.clock) read AC-backed time. The local `clock` variable
    // continues to be used by the closures below (cueWhen) — those closures
    // need direct access to the AC clock and are UNCHANGED by this proxy wiring.
    proxy.setSource(clock)

    // Timbre is read once and captured into the four returned closures. A
    // cross-tab timbre change mid-session must NOT mutate this session's cues —
    // mirrors useAudioCues timbreRef posture. Do not refactor these closures to
    // re-read getTimbre() each call without preserving this invariant.
    const timbre = getTimbre()
    const cueWhen = (): number => clock.now() + SAFE_LEAD_SEC
    const countdownTick = (): void => {
      if (mutedRef.current) return
      scheduleCountdownTick(audioCtx, cueWhen(), audioCtx.destination, timbre)
    }

    return {
      callbacks: {
        frontMarker: () => {
          if (!mutedRef.current) scheduleNKFrontMarker(audioCtx, cueWhen(), audioCtx.destination, timbre)
        },
        backMarker: () => {
          if (!mutedRef.current) scheduleNKBackMarker(audioCtx, cueWhen(), audioCtx.destination, timbre)
        },
        tick: () => {
          if (!mutedRef.current) scheduleNKTick(audioCtx, cueWhen(), audioCtx.destination, timbre)
        },
        finalTick: () => {
          if (!mutedRef.current) scheduleNKFinalTick(audioCtx, cueWhen(), audioCtx.destination, timbre)
        },
        endCue: () => {
          if (!mutedRef.current) scheduleEndChord(audioCtx, cueWhen(), audioCtx.destination, timbre)
        },
      },
      countdownTick,
    }
  }, [proxy, bypassSilentMode])

  const close = useCallback((): void => {
    const audioCtx = audioCtxRef.current
    audioCtxRef.current = null
    if (audioCtx !== null) {
      silentBypassRef.current?.teardown()
      silentBypassRef.current = null
      closeAudioContext(audioCtx)
      // Revert posture: proxy reverts to wall clock after AC teardown so any
      // post-close clock.now() reads (e.g. from useNKEngine.end()) get a sensible
      // wall-clock value rather than reading from a closed AC.
      proxy.setSource(createWallSessionClock())
    }
  }, [proxy])

  const closeAfterEndCue = useCallback((): void => {
    const audioCtx = audioCtxRef.current
    audioCtxRef.current = null
    const silentBypass = silentBypassRef.current
    silentBypassRef.current = null
    if (audioCtx !== null) {
      // Proxy revert is SYNCHRONOUS — not inside the setTimeout callback.
      // Post-end stats reads from useNKEngine.end()'s onComplete chain fire
      // before the AC actually closes; they must read a sensible clock value.
      // The AC teardown AND the silent-loop teardown are deferred for ring-out so
      // the end chord stays routed through the speaker until it finishes.
      proxy.setSource(createWallSessionClock())
      window.setTimeout(() => {
        closeAudioContext(audioCtx)
        silentBypass?.teardown()
      }, END_CHORD_RINGOUT_MS)
    }
  }, [proxy])

  useEffect(() => {
    return () => {
      const audioCtx = audioCtxRef.current
      audioCtxRef.current = null
      silentBypassRef.current?.teardown()
      silentBypassRef.current = null
      if (audioCtx !== null) {
        closeAudioContext(audioCtx)
        // Defensive revert on unmount: a stray clock.now() read in the same
        // tick should still resolve to a sensible wall-clock value rather than
        // a frozen closed-AC timestamp.
        proxy.setSource(createWallSessionClock())
      }
    }
  }, [proxy])

  return { begin, close, closeAfterEndCue, clock: proxy.clock }
}
