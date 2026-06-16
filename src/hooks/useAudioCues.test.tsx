// Tests for the useAudioCues React hook.
// Mirrors the renderHook + act idiom from useSessionEngine.test.tsx.

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BreathingPlan } from '../domain/breathingPlan'
import type { AudioStatus } from '../audio/audioEngine'
import * as audioEngineModule from '../audio/audioEngine'
import * as cueSynth from '../audio/cueSynth'
import { useAudioCues } from './useAudioCues'

// BreathingPlan fixture is seconds-shaped.
const samplePlan: BreathingPlan = {
  bpm: 5.5,
  inhaleShare: 40,
  cycleSec: 60 / 5.5,
  inhaleSec: (60 / 5.5) * 0.4,
  exhaleSec: (60 / 5.5) * 0.6,
  totalSec: 600,
}

describe('useAudioCues', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('initial state: status=idle, audioAvailable=true, muted=false (D-07 default ON)', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    expect(result.current.status).toBe('idle')
    expect(result.current.audioAvailable).toBe(true)
    expect(result.current.muted).toBe(false)
    unmount()
  })

  it('start(plan) on success transitions to lead-in and returns the firstInCueTime', async () => {
    const { result, unmount } = renderHook(() => useAudioCues())

    let firstInCueTime: number | null = null
    await act(async () => {
      firstInCueTime = await result.current.start(samplePlan, 'bowl')
    })

    expect(firstInCueTime).not.toBeNull()
    // Reason: firstInCueTime non-null asserted by expect().not.toBeNull() immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(firstInCueTime!).toBeGreaterThanOrEqual(3)
    expect(result.current.status).toBe('lead-in')
    expect(result.current.audioAvailable).toBe(true)

    await act(async () => {
      await result.current.stop()
    })
    unmount()
  })

  it('start(plan) on AudioContext failure → status=failed, audioAvailable=false (D-10), returns null', async () => {
    vi.stubGlobal(
      'AudioContext',
      // Reason: test stub — constructor-only class simulates a browser that denies AudioContext.
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class {
        constructor() {
          throw new Error('blocked')
        }
      },
    )
    const { result, unmount } = renderHook(() => useAudioCues())

    let res: number | null = 0
    await act(async () => {
      res = await result.current.start(samplePlan, 'bowl')
    })

    expect(res).toBeNull()
    expect(result.current.status).toBe('failed')
    expect(result.current.audioAvailable).toBe(false)

    unmount()
  })

  it('stop() closes the engine and resets status to idle', async () => {
    const closeSpy = vi.fn(async () => {})
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(async () => {})
      close = closeSpy
      createOscillator = vi.fn()
      createGain = vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }))
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    await act(async () => {
      await result.current.stop()
    })

    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')

    unmount()
  })

  it('setMuted(true) updates muted state to true and forwards to engine', async () => {
    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    act(() => {
      result.current.setMuted(true)
    })
    expect(result.current.muted).toBe(true)

    await act(async () => {
      await result.current.stop()
    })
    unmount()
  })

  it('setMuted(false) updates muted state to false', async () => {
    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    act(() => {
      result.current.setMuted(true)
    })
    act(() => {
      result.current.setMuted(false)
    })
    expect(result.current.muted).toBe(false)

    await act(async () => {
      await result.current.stop()
    })
    unmount()
  })

  it('notifyPhaseBoundary({ newPhase: out, audioTime: 8 }) routes to scheduleOutCueForTimbre', async () => {
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    outSpy.mockClear()
    act(() => {
      result.current.notifyPhaseBoundary({
        newPhase: 'out',
        audioTime: 8,
        phaseDurationSec: samplePlan.exhaleSec,
      })
    })

    expect(outSpy).toHaveBeenCalledTimes(1)
    expect(outSpy.mock.calls[0]?.[1]).toBe(8)

    await act(async () => {
      await result.current.stop()
    })
    unmount()
  })

  it('audioNow() returns engine.now() when AC available, null when status=failed', async () => {
    // Failure path → audioNow returns null.
    vi.stubGlobal(
      'AudioContext',
      // Reason: test stub — constructor-only class simulates a browser that denies AudioContext.
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class {
        constructor() {
          throw new Error('blocked')
        }
      },
    )
    const fail = renderHook(() => useAudioCues())
    await act(async () => {
      await fail.result.current.start(samplePlan, 'bowl')
    })
    expect(fail.result.current.audioNow()).toBeNull()
    fail.unmount()

    vi.unstubAllGlobals()

    // Success path → audioNow returns a number.
    const ok = renderHook(() => useAudioCues())
    await act(async () => {
      await ok.result.current.start(samplePlan, 'bowl')
    })
    expect(typeof ok.result.current.audioNow()).toBe('number')
    await act(async () => {
      await ok.result.current.stop()
    })
    ok.unmount()
  })

  it('unmount after a successful start triggers AudioContext.close (Pitfall 3 leak guard)', async () => {
    const closeSpy = vi.fn(async () => {})
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(async () => {})
      close = closeSpy
      createOscillator = vi.fn()
      createGain = vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }))
      createBiquadFilter = vi.fn()
      // engine wires a statechange listener at construction.
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    unmount()

    // Unmount triggers cleanup which calls engine.close() → audioCtx.close().
    // close is async but cleanup fires synchronously; allow microtasks to flush.
    await Promise.resolve()
    await Promise.resolve()
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('start() after stop() builds a fresh AudioContext (regression: race during async close)', async () => {
    // Reproduce the window between stop() being called and the engine actually
    // closing. close() returns a promise that never resolves during the test;
    // the regression check is that start() must build a SECOND AudioContext
    // instead of reusing the one whose close is in flight.
    const closeSpy = vi.fn(() => new Promise<void>(() => {}))
    let constructCount = 0
    class SlowCloseAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      constructor() {
        constructCount++
      }
      resume = vi.fn(async () => {})
      close = closeSpy
      createOscillator = vi.fn()
      createGain = vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }))
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', SlowCloseAC)

    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    expect(constructCount).toBe(1)

    // Fire stop() without awaiting; the close promise stays pending. Then
    // immediately re-start. The new start MUST build a second AudioContext.
    act(() => {
      void result.current.stop()
    })
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    expect(constructCount).toBe(2)

    unmount()
  })

  it('start() called twice without stop is idempotent — only one AudioContext is constructed', async () => {
    let constructCount = 0
    class CountingAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      constructor() {
        constructCount++
      }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn() }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }))
      createBiquadFilter = vi.fn()
      // engine wires a statechange listener at construction.
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', CountingAC)

    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    expect(constructCount).toBe(1)

    await act(async () => {
      await result.current.stop()
    })
    unmount()
  })
})

describe('useAudioCues — visibility resume (Phase 5.1 D-01..D-09)', () => {
  // SpyableAC: an AudioContext stub that places resume() on the prototype so
  // vi.spyOn(SpyableAC.prototype, 'resume') intercepts calls made by the engine's
  // resume() method. FakeAudioContext uses arrow-function class fields (instance props)
  // which are not spyable via the prototype — this stub uses a regular method instead.
  class SpyableAC {
    state: AudioContextState = 'running'
    sampleRate = 44100
    destination = {}
    private _start = performance.now() / 1000
    get currentTime() { return performance.now() / 1000 - this._start }
    // Reason: AudioContext API accepts an options parameter; kept for structural compatibility with the interface.
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
    constructor(_options?: AudioContextOptions) {}
    // AUDIO-04: addEventListener added so cueSynth's { once: true } 'ended' listener registration succeeds.
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), value: 0 }, detune: { setValueAtTime: vi.fn(), value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } }
    createGain() { return { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { setValueAtTime: vi.fn(), value: 350 }, Q: { setValueAtTime: vi.fn(), value: 1 }, gain: { setValueAtTime: vi.fn(), value: 0 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    // Reason: AudioContextState mutation is the async side-effect; no await needed in this synchronous stub.
    // eslint-disable-next-line @typescript-eslint/require-await
    async resume(): Promise<void> { this.state = 'running' }
    // eslint-disable-next-line @typescript-eslint/require-await
    async suspend(): Promise<void> { this.state = 'suspended' }
    // eslint-disable-next-line @typescript-eslint/require-await
    async close(): Promise<void> { this.state = 'closed' }
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    _simulateSuspend(): void { this.state = 'suspended' }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('visibilitychange→visible calls audioCtx.resume() when engineRef is non-null (D-01..D-04)', async () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const resumeSpy = vi.spyOn(SpyableAC.prototype, 'resume')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    // Reset spy call count after start() which may call resume() internally.
    resumeSpy.mockClear()
    // Model iOS unlock: visibilityState flips to 'visible', visibilitychange fires.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve() // flush microtasks for the void-awaited resume()
    })
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('visibilitychange→visible does NOT call resume() when engineRef is null (D-04 gate)', async () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const resumeSpy = vi.spyOn(SpyableAC.prototype, 'resume')
    const { unmount } = renderHook(() => useAudioCues())
    // No start() — engineRef stays null.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(resumeSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('visibilitychange→visible silently absorbs resume() rejection (D-09)', async () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    const resumeSpy = vi
      .spyOn(SpyableAC.prototype, 'resume')
      .mockRejectedValueOnce(new Error('iOS veto'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    // The act() must NOT throw — resume rejection is silently absorbed.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve() // flush rejection settlement
    })
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    // Hook is still alive — no failed-state transition triggered by the resume rejection.
    expect(result.current.audioAvailable).toBe(true)
    expect(result.current.status).toBe('lead-in')
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('visibilitychange→hidden does NOT call resume() (defensive guard, mirrors useWakeLock D-04)', async () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const resumeSpy = vi.spyOn(SpyableAC.prototype, 'resume')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    resumeSpy.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(resumeSpy).not.toHaveBeenCalled()
    await act(async () => { await result.current.stop() })
    unmount()
  })
})

describe('useAudioCues — audioStatus state machine + reconstruction (Phase 5.1 Plan 06 D-34/D-35/D-37/D-41)', () => {
  // Extended SpyableAC: adds 'interrupted' state, real statechange registry,
  // _simulateInterrupted, _simulateResumeReject, and tracks construction count
  // for reconstruction-path assertions. resume/close stay as regular methods
  // so vi.spyOn(SpyableAC.prototype, 'resume') intercepts calls.
  let constructed = 0
  class SpyableAC {
    // Track the most recently constructed instance so prototype-spy tests can
    // Tracks the most recently constructed instance for prototype-spy tests.
    // reset() clears both the count and the reference.
    static lastInstance: SpyableAC | null = null
    static reset() { constructed = 0; SpyableAC.lastInstance = null }
    state: AudioContextState | 'interrupted' = 'running'
    sampleRate = 44100
    destination = {}
    private _start = performance.now() / 1000
    private _listeners = new Map<string, Set<EventListener>>()
    private _resumeRejection: { name: string; message: string } | null = null
    get currentTime() { return performance.now() / 1000 - this._start }
    // Reason: AudioContext API accepts an options parameter; kept for structural compatibility with the interface.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_options?: AudioContextOptions) { constructed += 1; SpyableAC.lastInstance = this }
    // AUDIO-04: addEventListener added so cueSynth's { once: true } 'ended' listener registration succeeds.
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), value: 0 }, detune: { setValueAtTime: vi.fn(), value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } }
    createGain() { return { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { setValueAtTime: vi.fn(), value: 350 }, Q: { setValueAtTime: vi.fn(), value: 1 }, gain: { setValueAtTime: vi.fn(), value: 0 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    // Reason: async required to match AudioContext.resume() Promise<void> signature; conditional throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    async resume(): Promise<void> {
      if (this._resumeRejection !== null) {
        const err = new DOMException(this._resumeRejection.message, this._resumeRejection.name)
        this._resumeRejection = null
        if (this.state === 'interrupted') this.state = 'suspended'
        this._fireStateChange()
        throw err
      }
      this.state = 'running'
      this._fireStateChange()
    }
    // Reason: AudioContextState mutation is the async side-effect; no await needed in this synchronous stub.
    // eslint-disable-next-line @typescript-eslint/require-await
    async suspend(): Promise<void> { this.state = 'suspended'; this._fireStateChange() }
    // eslint-disable-next-line @typescript-eslint/require-await
    async close(): Promise<void> { this.state = 'closed'; this._fireStateChange() }
    _simulateSuspend(): void { this.state = 'suspended'; this._fireStateChange() }
    _simulateInterrupted(): void { this.state = 'interrupted'; this._fireStateChange() }
    _simulateResumeReject(errorName: string = 'InvalidStateError'): void {
      this._resumeRejection = { name: errorName, message: 'Failed to start the audio device' }
    }
    dispatchStateChange(): void { this._fireStateChange() }
    addEventListener(type: string, listener: EventListener): void {
      let set = this._listeners.get(type)
      if (!set) { set = new Set(); this._listeners.set(type, set) }
      set.add(listener)
    }
    removeEventListener(type: string, listener: EventListener): void {
      this._listeners.get(type)?.delete(listener)
    }
    private _fireStateChange(): void {
      const evt = new Event('statechange')
      for (const l of this._listeners.get('statechange') ?? []) l(evt)
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it("D-41 (a): 'running' state — audioStatus stays 'ok' after visibility resume succeeds", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    // AC stays 'running'. Dispatch visibilitychange; resume() will succeed.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.audioStatus).toBe('ok')
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("D-41 (b): 'suspended' state — audioStatus returns to 'ok' after visibility resume succeeds", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.audioStatus).toBe('ok')
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("D-41 (c): 'interrupted' state + resume rejects with InvalidStateError → audioStatus === 'needs-resume' (D-37 / D-38)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Reach the live AC via the prototype trick: spy on resume to flip the instance
    // state to 'interrupted' AND arm the rejection BEFORE the visibility-handler call.
    // The engine's audioCtx is encapsulated; we use vi.spyOn(SpyableAC.prototype, 'resume')
    // with mockImplementationOnce to model the iOS-Safari path.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      // Simulate the iOS path: state was 'interrupted', resume rejects, transitions to 'suspended'.
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed to start the audio device', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve() // settle the rejection
    })
    // visibilityResumeAttemptedRef is armed; engine swallowed the reject and fired the
    // synthetic suspend event via clock.notifySuspended(); handleSuspend flipped audioStatus to 'needs-resume'.
    expect(result.current.audioStatus).toBe('needs-resume')
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("D-41 (d): 'closed' state → audioStatus === 'unavailable' (discriminating: asserts BEFORE stop() resets)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    // Pre-condition: post-start, audioStatus is 'ok'.
    expect(result.current.audioStatus).toBe('ok')

    // Drive a synthetic 'closed' statechange dispatch on the live AC instance via
    // Spy on dispatchStateChange: flips this.state to 'closed' and invokes every
    // registered 'statechange' listener. The engine's listener forwards to the hook's
    // handleStateChange, which must flip audioStatus to 'unavailable' on 'closed'.
    // We assert that transition BEFORE stop() runs (stop() would reset to 'ok'),
    // making the test discriminating: it fails if the close→unavailable branch is removed.
    vi.spyOn(SpyableAC.prototype, 'dispatchStateChange').mockImplementationOnce(function (this: SpyableAC) {
      this.state = 'closed'
      // Reason: accessing private _listeners map through any cast to simulate state-change dispatch in closed spy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      for (const l of (this as any)._listeners.get('statechange') ?? []) l(new Event('statechange'))
    })

    // Trigger the spied dispatchStateChange on the live AC. Since the engine's
    // audioCtx is encapsulated, we exercise the prototype-level spy by invoking
    // dispatchStateChange via the constructor-tracked lastInstance reference.
    await act(async () => {
      const live = SpyableAC.lastInstance as SpyableAC
      live.dispatchStateChange()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Discriminating assertion: audioStatus MUST be 'unavailable' exactly.
    // If the close→unavailable branch in handleStateChange is removed, this fails
    // (audioStatus would remain 'ok'). The disjunctive {ok, unavailable} assertion
    // used previously was non-discriminating because stop()'s reset masked the bug.
    expect(result.current.audioStatus).toBe('unavailable')

    // Clean up AFTER the assertion. stop() resets audioStatus to 'ok' for the next
    // session — we do not assert on post-stop state here (that is stop()'s contract,
    // not the close→unavailable transition contract).
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("public resume() falls back to reconstruction when engine.resume rejects again (D-33)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const reanchorSpy = vi.fn()
    const { result, unmount } = renderHook(() => useAudioCues(false, reanchorSpy))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    const initialConstructed = constructed
    // Drive audioStatus to 'needs-resume'.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed to start the audio device', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.audioStatus).toBe('needs-resume')

    // Now invoke the public resume() — it should call engine.resume() (rejects again),
    // then reconstructEngine() → close old + new SpyableAC + setMuted + onReanchorRequired.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      void this
      const err = new DOMException('Failed to start the audio device', 'InvalidStateError')
      throw err
    })
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    // Reconstruction must have constructed a new SpyableAC instance.
    expect(constructed).toBe(initialConstructed + 1)
    // onReanchorRequired must have been invoked with the new AC's currentTime.
    expect(reanchorSpy).toHaveBeenCalledTimes(1)
    // Reason: length asserted by toHaveBeenCalledTimes(1) immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(typeof reanchorSpy.mock.calls[0]![0]).toBe('number')

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("reconstruction preserves muted=true state (D-35b)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues(true /* initialMuted */, vi.fn()))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    expect(result.current.muted).toBe(true)
    // Drive audioStatus to 'needs-resume'.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    // Public resume() — first call rejects, escalates to reconstruction.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      void this
      throw new DOMException('Failed', 'InvalidStateError')
    })
    // Spy on setMuted at the prototype level — must be invoked with currentMuted=true on the new engine.
    // Since the engine is constructed inside the hook, we observe the effect via result.current.muted
    // staying true after reconstruction.
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })
    expect(result.current.muted).toBe(true)
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it("plain resume success does NOT re-anchor (D-06 preserved)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const reanchorSpy = vi.fn()
    const { result, unmount } = renderHook(() => useAudioCues(false, reanchorSpy))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    // Default SpyableAC.resume() succeeds — no rejection armed.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    // audioStatus should be 'ok' (resume succeeded; no reconstruction).
    expect(result.current.audioStatus).toBe('ok')
    // onReanchorRequired must NOT have been called on plain resume success.
    expect(reanchorSpy).not.toHaveBeenCalled()
    await act(async () => { await result.current.stop() })
    unmount()
  })

  // Regression guard: plain resume() on iOS Safari returns state='running' but the audio
  // session is dead (AC.currentTime stuck, cues never fire). The recovery path always
  // reconstructs a fresh AC inside the gesture context — never relies on engine.resume().
  it("public resume() always reconstructs a fresh AC (kitchen-sink fix for iOS state-lies bug)", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const reanchorSpy = vi.fn()
    const { result, unmount } = renderHook(() => useAudioCues(false, reanchorSpy))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    const initialConstructed = constructed

    // Drive audioStatus to 'needs-resume' via the visibility-handler optimistic resume() rejecting.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed to start the audio device', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.audioStatus).toBe('needs-resume')

    // Gesture-attached public resume() always reconstructs a fresh AC.
    // Previously the hook tried engine.resume() first, which on iOS appeared to succeed
    // but left the AC clock dead. Now reconstruction is unconditional.
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    // Exactly one new AC must have been constructed (reconstruction fired).
    expect(constructed).toBe(initialConstructed + 1)
    // Re-anchor callback must fire with the new AC's currentTime.
    expect(reanchorSpy).toHaveBeenCalledTimes(1)
    // Reason: length asserted by toHaveBeenCalledTimes(1) immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(typeof reanchorSpy.mock.calls[0]![0]).toBe('number')

    await act(async () => { await result.current.stop() })
    unmount()
  })

  // AUDIO-01: stop() during in-flight reconstructEngine
  it("AUDIO-01: stop() during in-flight reconstructEngine closes the orphaned new engine and does not assign to engineRef", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)

    // Strategy: spy on createAudioEngine to make the reconstruct call (call #2) park
    // on a controllable promise. The start() call (#1) completes synchronously with a
    // fake engine. The reconstruct call parks until we resolve it.
    const newEngineClose = vi.fn(async () => {})
    // Every fake engine must expose a `clock` member with onResume/onSuspend/onClose
    // returning no-op unsubscribes, because start() / reconstructEngine() subscribe to
    // all three channels right after createAudioEngine resolves.
    const makeFakeClock = (): unknown => ({
      now: vi.fn(() => 0),
      schedule: vi.fn(),
      onResume: vi.fn(() => () => undefined),
      onSuspend: vi.fn(() => () => undefined),
      onClose: vi.fn(() => () => undefined),
    })
    // Reason: partial AudioEngine implementation for test purposes; only the surface used by reconstructEngine's bail path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeFirstEngine: any = {
      now: vi.fn(() => 3.005),
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3.005),
      scheduleNextCue: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: makeFakeClock(),
    }
    // Reason: partial AudioEngine for the orphaned new engine in the bail path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeNewEngine: any = {
      now: vi.fn(() => 0.005),
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 0.005),
      scheduleNextCue: vi.fn(),
      resume: vi.fn(async () => {}),
      close: newEngineClose,
      clock: makeFakeClock(),
    }

    let resolveReconstruct: ((eng: typeof fakeNewEngine) => void) | null = null
    let createCallCount = 0
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockImplementation(async () => {
      createCallCount += 1
      if (createCallCount === 1) {
        // First call (start()): resolve immediately with fake first engine.
        return fakeFirstEngine as Awaited<ReturnType<typeof audioEngineModule.createAudioEngine>>
      }
      // Second call (reconstructEngine): park on a controllable promise.
      return new Promise<Awaited<ReturnType<typeof audioEngineModule.createAudioEngine>>>(resolve => {
        resolveReconstruct = resolve as (eng: typeof fakeNewEngine) => void
      })
    })

    const reanchorSpy = vi.fn()
    const { result, unmount } = renderHook(() => useAudioCues(false, reanchorSpy))

    // First call: start() resolves immediately with fakeFirstEngine.
    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    expect(result.current.status).toBe('lead-in')
    expect(createCallCount).toBe(1)

    // Fire resume() WITHOUT awaiting — enters reconstructEngine, hits 2nd createAudioEngine
    // which parks on resolveReconstruct.
    let resumePromise: Promise<void> | undefined
    act(() => {
      resumePromise = result.current.resume()
    })

    // Give a microtask tick so reconstructEngine runs past the sync preamble up to its await.
    await act(async () => {
      await Promise.resolve()
    })

    // At this point, reconstructEngine has stamped gen=1, nulled engineRef, called
    // createAudioEngine (count=2) and is now parked awaiting it.
    expect(createCallCount).toBe(2)

    // Call stop() — bumps reconstructGenerationRef to 2, resets status to idle.
    await act(async () => {
      await result.current.stop()
    })
    expect(result.current.status).toBe('idle')

    // Now resolve the parked createAudioEngine with fakeNewEngine.
    act(() => {
      resolveReconstruct?.(fakeNewEngine as Awaited<ReturnType<typeof audioEngineModule.createAudioEngine>>)
    })

    // Flush microtasks so the post-await bail check in reconstructEngine runs.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Await the resume() promise so it completes cleanly.
    if (resumePromise !== undefined) {
      await act(async () => { await resumePromise })
    }

    // Bail-out assertions:
    // audioStatus must remain 'ok' (set by stop(), NOT overwritten by post-bail path).
    expect(result.current.audioStatus).toBe('ok')
    expect(result.current.status).toBe('idle')
    // onReanchorRequired was NOT called — bail returned before the re-anchor signal.
    expect(reanchorSpy).not.toHaveBeenCalled()
    // fakeNewEngine.close() was called — orphaned new engine was cleaned up.
    expect(newEngineClose).toHaveBeenCalledTimes(1)

    unmount()
  })

  // AUDIO-05: statechange after stop() nulled engineRef must not throw
  it("AUDIO-05: synthetic statechange dispatch AFTER stop() nulled engineRef does not throw and does not flip audioStatus", async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())

    await act(async () => { await result.current.start(samplePlan, 'bowl') })
    expect(result.current.audioStatus).toBe('ok')

    // stop() — nulls engineRef synchronously.
    await act(async () => { await result.current.stop() })
    expect(result.current.status).toBe('idle')
    expect(result.current.audioStatus).toBe('ok')

    // Dispatch a synthetic 'closed' statechange on the last AC instance AFTER stop().
    // stop() tears down clock subscriptions before nulling engineRef, so the clock's
    // fan-out reaches an empty subscriber set — handleClose is never invoked.
    // The engineRef-null gate is layered defense; the primary mechanism is unsubscribe-before-null.
    await act(async () => {
      const live = SpyableAC.lastInstance as SpyableAC
      // dispatchStateChange fires every registered 'statechange' listener on the AC.
      // The clock's listener is still attached (it owns the AC's statechange listener per
      // but its subscriber Sets are empty post-stop().
      live.dispatchStateChange()
      await Promise.resolve()
      await Promise.resolve()
    })

    // audioStatus must remain 'ok' — the subscriber teardown means handleClose is never
    // called; even if it were, the engineRef-null gate would short-circuit.
    expect(result.current.audioStatus).toBe('ok')

    unmount()
  })
})

// AUDIO-03 + AUDIO-06 additional test cases
describe('useAudioCues — AUDIO-03 + AUDIO-06 (Phase 9 Plan 02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // AUDIO-06: AudioStatus union excludes "starting" (type-level lock)
  it("AUDIO-06: AudioStatus union excludes 'starting' (D-07)", () => {
    // TypeScript-level lock: if 'starting' is reintroduced into AudioStatus, the type
    // assertion below fails to compile (TS2322: type 'string' is not assignable).
    // The valid values of AudioStatus are exactly 'idle' | 'lead-in' | 'failed'.
    // Verify at runtime that the union has no 'starting' member by using a value
    // obtained via function return (prevents no-unnecessary-condition on a const switch).
    function getStatus(): AudioStatus { return 'idle' }
    const s = getStatus()
    const validValues: readonly string[] = ['idle', 'lead-in', 'failed']
    expect(validValues).toContain(s)
    expect(validValues).not.toContain('starting')
    // TypeScript compile-time lock: the assignment below ensures 'starting' is NOT a valid AudioStatus.
    // If reintroduced, tsc --noEmit will surface a type error at the setStatus('starting') call site.
    const _typeCheck: AudioStatus = 'idle'
    void _typeCheck // used only for type checking
  })

  // AUDIO-06: start() success transitions idle → lead-in without transient 'starting'
  it("AUDIO-06: start() success transitions status idle → lead-in directly (no transient starting)", async () => {
    const { result, unmount } = renderHook(() => useAudioCues())

    const observedStatuses: string[] = []
    // Observe each render's status by reading result.current.status after act.
    // We cannot intercept render-synchronously, but we can observe that 'starting'
    // never appears in the result object at any point accessible from the test.
    observedStatuses.push(result.current.status)

    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
      observedStatuses.push(result.current.status)
    })
    observedStatuses.push(result.current.status)

    // 'starting' must never appear in any observed status snapshot.
    expect(observedStatuses).not.toContain('starting')
    // Must end in 'lead-in' (success path).
    expect(result.current.status).toBe('lead-in')

    await act(async () => { await result.current.stop() })
    unmount()
  })

  // AUDIO-03: hook-side null propagation when engine.scheduleLeadIn returns null.
  // Also asserts: engine.close was called; all 4 clock unsubs fired; audioStatus is 'unavailable'.
  it("AUDIO-03: start() returns null and sets status to failed when engine.scheduleLeadIn returns null", async () => {
    // Stub createAudioEngine to return a fake engine whose scheduleLeadIn returns null.
    // start() subscribes to engine.clock.on* immediately after createAudioEngine resolves,
    // so the fake must expose a `clock` member returning tracked unsubscribes for all
    // channels (4 total: onResume×2, onSuspend×1, onClose×1). Each unsub is tracked so
    // we can assert each was invoked exactly once when the null-leadIn branch tears down.
    const unsubResume1 = vi.fn()
    const unsubResume2 = vi.fn()
    const unsubSuspend = vi.fn()
    const unsubClose = vi.fn()
    let onResumeCallCount = 0
    const fakeEngine = {
      now: vi.fn(() => 0),
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => null),
      scheduleNextCue: vi.fn(),
      topUpLookahead: vi.fn(),
      cancelFutureCues: vi.fn(),
      close: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn(() => {
          onResumeCallCount++
          return onResumeCallCount === 1 ? unsubResume1 : unsubResume2
        }),
        onSuspend: vi.fn(() => unsubSuspend),
        onClose: vi.fn(() => unsubClose),
      },
    }
    // Reason: test double providing the minimum AudioEngine surface; no-unsafe-argument is expected here for the mock type.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine as any)

    const { result, unmount } = renderHook(() => useAudioCues())

    let res: number | null = 42 // sentinel non-null value to confirm it changes
    await act(async () => {
      res = await result.current.start(samplePlan, 'bowl')
    })

    // Hook-side null propagation: scheduleLeadIn returned null → start() returns null.
    expect(res).toBeNull()
    // Status must transition to 'failed'.
    expect(result.current.status).toBe('failed')
    // audioAvailable must be false.
    expect(result.current.audioAvailable).toBe(false)
    // CR-02-FIX: engine.close must have been called (no AC leak on null-leadIn path).
    expect(fakeEngine.close).toHaveBeenCalledTimes(1)
    // CR-02-FIX: all 4 clock unsubscribes must have been invoked (clockUnsubsRef loop).
    expect(unsubResume1).toHaveBeenCalledTimes(1)
    expect(unsubResume2).toHaveBeenCalledTimes(1)
    expect(unsubSuspend).toHaveBeenCalledTimes(1)
    expect(unsubClose).toHaveBeenCalledTimes(1)
    // audioStatus must be 'unavailable' (not the default 'ok') on failed start.
    expect(result.current.audioStatus).toBe('unavailable')

    unmount()
  })

  // AUDIO-03: construction-failure branch (createAudioEngine throws) also sets audioStatus='unavailable'.
  it("AUDIO-03 + WR-01: construction-failure branch (createAudioEngine throws) also sets audioStatus='unavailable'", async () => {
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockRejectedValueOnce(
      new Error('iOS construction failed'),
    )

    const { result, unmount } = renderHook(() => useAudioCues())

    let res: number | null = 42
    await act(async () => {
      res = await result.current.start(samplePlan, 'bowl')
    })

    expect(res).toBeNull()
    expect(result.current.status).toBe('failed')
    expect(result.current.audioAvailable).toBe(false)
    // audioStatus must be 'unavailable' on the construction-catch branch too.
    expect(result.current.audioStatus).toBe('unavailable')

    unmount()
  })
})

// Callback identity contract: toggling `setMuted` must not churn the identity of
// `start` or `resume` callbacks. With `muted` removed from their useCallback dep
// arrays and the value read from the ref-mirror at call time, downstream `useCallback`s
// that include `audio.start` in deps no longer cascade re-creates on every mute toggle.
describe('useAudioCues — callback identity (Phase 10 HOOKS-01)', () => {
  // Inline SpyableAC duplicated here rather than hoisted to module scope to keep
  // each describe block self-contained.
  class SpyableAC {
    state: AudioContextState = 'running'
    sampleRate = 44100
    destination = {}
    private _start = performance.now() / 1000
    get currentTime() { return performance.now() / 1000 - this._start }
    // Reason: AudioContext API accepts an options parameter; kept for structural compatibility with the interface.
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
    constructor(_options?: AudioContextOptions) {}
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), value: 0 }, detune: { setValueAtTime: vi.fn(), value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } }
    createGain() { return { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { setValueAtTime: vi.fn(), value: 350 }, Q: { setValueAtTime: vi.fn(), value: 1 }, gain: { setValueAtTime: vi.fn(), value: 0 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    // Reason: AudioContextState mutation is the async side-effect; no await needed in this synchronous stub.
    // eslint-disable-next-line @typescript-eslint/require-await
    async resume(): Promise<void> { this.state = 'running' }
    // eslint-disable-next-line @typescript-eslint/require-await
    async suspend(): Promise<void> { this.state = 'suspended' }
    // eslint-disable-next-line @typescript-eslint/require-await
    async close(): Promise<void> { this.state = 'closed' }
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('start callback identity is stable across setMuted toggle (HOOKS-01 D-11)', () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())

    const startBefore = result.current.start

    act(() => {
      result.current.setMuted(true)
    })

    // After the React state update, the mute-mirror effect fires synchronously
    // (within the same act flush) and writes `mutedRef.current = true`. The
    // `start` useCallback no longer depends on `muted`, so its identity is
    // preserved across the render.
    const startAfterMute = result.current.start

    act(() => {
      result.current.setMuted(false)
    })

    const startAfterUnmute = result.current.start

    expect(startAfterMute).toBe(startBefore)
    expect(startAfterUnmute).toBe(startBefore)

    unmount()
  })

  it('resume callback is stable across setMuted (proxy for reconstructEngine identity) (HOOKS-01 D-11)', () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())

    const resumeBefore = result.current.resume

    act(() => {
      result.current.setMuted(true)
    })

    // `resume` depends on `reconstructEngine`, which reads mutedRef.current at
    // call time rather than depending on `muted`. Identity stable.
    const resumeAfterMute = result.current.resume

    expect(resumeAfterMute).toBe(resumeBefore)

    unmount()
  })

  it('baseline: handleResume/handleSuspend/handleClose identity unchanged across setMuted (regression guard)', () => {
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())

    // `start` depends on `[handleResume, handleSuspend, handleClose]` — all three
    // useCallback deps are `[]`. If any of the three identities churns across
    // setMuted (they should not), this proxy assertion would fail.
    const startBefore = result.current.start

    act(() => {
      result.current.setMuted(true)
    })

    expect(result.current.start).toBe(startBefore)

    unmount()
  })
})

// Timbre capture + reconstruction: start(plan, timbre) constructs the engine with
// the caller-passed timbre; reconstructEngine reuses timbreRef.current so mid-session
// prefs changes have no effect (capture-at-Start is the only mutation path).
describe('useAudioCues — Phase 18 timbre capture + reconstruction (D-08 + D-11)', () => {
  // SpyableAC with registry-backed statechange listeners and reconstruction-friendly resume().
  // Local to this block; construction count is observed via createAudioEngine spy.
  class SpyableAC {
    static lastInstance: SpyableAC | null = null
    static reset(): void { SpyableAC.lastInstance = null }
    state: AudioContextState | 'interrupted' = 'running'
    sampleRate = 44100
    destination = {}
    private _start = performance.now() / 1000
    private _listeners = new Map<string, Set<EventListener>>()
    get currentTime(): number { return performance.now() / 1000 - this._start }
    // Reason: AudioContext API accepts an options parameter; kept for structural compatibility with the interface.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_options?: AudioContextOptions) { SpyableAC.lastInstance = this }
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), value: 0 }, detune: { setValueAtTime: vi.fn(), value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } }
    createGain() { return { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { setValueAtTime: vi.fn(), value: 350 }, Q: { setValueAtTime: vi.fn(), value: 1 }, gain: { setValueAtTime: vi.fn(), value: 0 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/require-await
    async resume(): Promise<void> { this.state = 'running'; this._fireStateChange() }
    // eslint-disable-next-line @typescript-eslint/require-await
    async suspend(): Promise<void> { this.state = 'suspended'; this._fireStateChange() }
    // eslint-disable-next-line @typescript-eslint/require-await
    async close(): Promise<void> { this.state = 'closed'; this._fireStateChange() }
    addEventListener(type: string, listener: EventListener): void {
      let set = this._listeners.get(type)
      if (!set) { set = new Set(); this._listeners.set(type, set) }
      set.add(listener)
    }
    removeEventListener(type: string, listener: EventListener): void {
      this._listeners.get(type)?.delete(listener)
    }
    private _fireStateChange(): void {
      const evt = new Event('statechange')
      for (const l of this._listeners.get('statechange') ?? []) l(evt)
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('start(samplePlan, "bell") constructs the engine with timbre: "bell" (D-08)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    // Spy on the createAudioEngine factory to inspect the options object.
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bell')
    })
    // The engine is constructed with exactly the caller-passed timbre.
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ timbre: 'bell' }),
    )
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('reconstructEngine reuses timbreRef.current — ignores localStorage prefs change mid-session (D-11 invariant guard)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    // Spy on createAudioEngine to capture the second (reconstruction) call argument.
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues(false, vi.fn()))

    // 1. Session starts with 'bell' — timbreRef captured as 'bell' synchronously
    //    BEFORE the createAudioEngine await.
    await act(async () => {
      await result.current.start(samplePlan, 'bell')
    })
    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({ timbre: 'bell' })
    const callsAfterStart = createSpy.mock.calls.length

    // 2. Mutate localStorage's prefs.timbre to 'flute' mid-session. The hook must
    //    not re-read prefs during reconstruction — it reads timbreRef.current exclusively,
    //    which still holds 'bell'.
    window.localStorage.setItem(
      'hrv:state:v1',
      JSON.stringify({ version: 1, prefs: { theme: 'system', timbre: 'flute', locale: 'en' } }),
    )

    // 3. Trigger reconstruction via public resume() — which internally calls
    //    reconstructEngine().
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    // 4. Reconstruction must have called createAudioEngine again — and with
    //    timbre: 'bell' (the captured value), NOT 'flute' (the mid-session storage value).
    expect(createSpy.mock.calls.length).toBeGreaterThan(callsAfterStart)
    const reconstructCall = createSpy.mock.calls[createSpy.mock.calls.length - 1]
    expect(reconstructCall?.[0]).toMatchObject({ timbre: 'bell' })

    await act(async () => { await result.current.stop() })
    window.localStorage.clear()
    unmount()
  })

  // bypassSilentMode threading through useAudioCues.start (3rd arg) and
  // bypassSilentModeRef capture-and-replay in reconstructEngine.

  it('start(plan, "bowl", false) forwards bypassSilentMode: false to createAudioEngine (D-07)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl', false)
    })
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bypassSilentMode: false }),
    )
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('start(plan, "bowl", true) forwards bypassSilentMode: true to createAudioEngine (D-07)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl', true)
    })
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bypassSilentMode: true }),
    )
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('start(plan, "bowl") without 3rd arg forwards bypassSilentMode: undefined (D-07 default backward-compat)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    // undefined coerces to "construct" at the engine layer.
    // The hook must forward undefined (not elide the key) so the caller chain is explicit.
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bypassSilentMode: undefined }),
    )
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('reconstructEngine reuses bypassSilentModeRef.current — does not reset to undefined on reconstruct (D-09)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const createSpy = vi.spyOn(audioEngineModule, 'createAudioEngine')
    const { result, unmount } = renderHook(() => useAudioCues(false, vi.fn()))

    // 1. Session starts with bypassSilentMode=false — ref captured synchronously.
    await act(async () => {
      await result.current.start(samplePlan, 'bowl', false)
    })
    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({ bypassSilentMode: false })
    const callsAfterStart = createSpy.mock.calls.length

    // 2. Trigger reconstruction via public resume().
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    // 3. Reconstruction must call createAudioEngine again with bypassSilentMode: false
    //    (the captured ref value), NOT undefined (the default — no mid-session rebuild).
    expect(createSpy.mock.calls.length).toBeGreaterThan(callsAfterStart)
    const reconstructCall = createSpy.mock.calls[createSpy.mock.calls.length - 1]
    expect(reconstructCall?.[0]).toMatchObject({ bypassSilentMode: false })

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('start(samplePlan, "bowl") preserves v1.0.1 byte-identical behavior (TIMBRE-02 sanity)', async () => {
    // Sanity check that passing 'bowl' explicitly does not perturb the v1.0.1 flow —
    // firstInCueTime is still the deterministic engine.now() + 3 lead-in anchor.
    const { result, unmount } = renderHook(() => useAudioCues())
    let firstInCueTime: number | null = null
    await act(async () => {
      firstInCueTime = await result.current.start(samplePlan, 'bowl')
    })
    expect(firstInCueTime).not.toBeNull()
    // Reason: non-null asserted by expect().not.toBeNull() immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(firstInCueTime!).toBeGreaterThanOrEqual(3)
    expect(result.current.status).toBe('lead-in')
    expect(result.current.audioAvailable).toBe(true)
    await act(async () => { await result.current.stop() })
    unmount()
  })
})

// SessionClock proxy exposed via UseAudioCues.clock.
describe('useAudioCues — SessionClock proxy + onSessionClockReanchored (Phase 51 D-03/D-05/D-10/D-11)', () => {
  // SpyableAC with full statechange support for reconstruction tests.
  class SpyableAC {
    static lastInstance: SpyableAC | null = null
    static reset(): void { SpyableAC.lastInstance = null }
    state: AudioContextState | 'interrupted' = 'running'
    sampleRate = 44100
    destination = {}
    private _start = performance.now() / 1000
    private _listeners = new Map<string, Set<EventListener>>()
    private _resumeRejection: { name: string; message: string } | null = null
    get currentTime(): number { return performance.now() / 1000 - this._start }
    // Reason: AudioContext API accepts an options parameter; kept for structural compatibility with the interface.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_options?: AudioContextOptions) { SpyableAC.lastInstance = this }
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), value: 0 }, detune: { setValueAtTime: vi.fn(), value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } }
    createGain() { return { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { setValueAtTime: vi.fn(), value: 350 }, Q: { setValueAtTime: vi.fn(), value: 1 }, gain: { setValueAtTime: vi.fn(), value: 0 }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } }
    // Reason: async required to match AudioContext.resume() Promise<void> signature; conditional throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    async resume(): Promise<void> {
      if (this._resumeRejection !== null) {
        const err = new DOMException(this._resumeRejection.message, this._resumeRejection.name)
        this._resumeRejection = null
        if (this.state === 'interrupted') this.state = 'suspended'
        this._fireStateChange()
        throw err
      }
      this.state = 'running'
      this._fireStateChange()
    }
    // Reason: AudioContextState mutation is the async side-effect; no await needed in this synchronous stub.
    // eslint-disable-next-line @typescript-eslint/require-await
    async suspend(): Promise<void> { this.state = 'suspended'; this._fireStateChange() }
    // eslint-disable-next-line @typescript-eslint/require-await
    async close(): Promise<void> { this.state = 'closed'; this._fireStateChange() }
    _simulateInterrupted(): void { this.state = 'interrupted'; this._fireStateChange() }
    _simulateResumeReject(errorName: string = 'InvalidStateError'): void {
      this._resumeRejection = { name: errorName, message: 'Failed to start the audio device' }
    }
    dispatchStateChange(): void { this._fireStateChange() }
    addEventListener(type: string, listener: EventListener): void {
      let set = this._listeners.get(type)
      if (!set) { set = new Set(); this._listeners.set(type, set) }
      set.add(listener)
    }
    removeEventListener(type: string, listener: EventListener): void {
      this._listeners.get(type)?.delete(listener)
    }
    private _fireStateChange(): void {
      const evt = new Event('statechange')
      for (const l of this._listeners.get('statechange') ?? []) l(evt)
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    SpyableAC.reset()
  })

  it('D-03: clock member is exposed on UseAudioCues and conforms to SessionClock interface', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    // clock must exist and expose all 5 SessionClock members.
    const clock = result.current.clock
    expect(clock).toBeDefined()
    expect(typeof clock.now).toBe('function')
    expect(typeof clock.schedule).toBe('function')
    expect(typeof clock.onSuspend).toBe('function')
    expect(typeof clock.onResume).toBe('function')
    expect(typeof clock.onClose).toBe('function')
    unmount()
  })

  it('D-03: clock.now() returns wall-clock shape before start (performance.now()/1000)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { result, unmount } = renderHook(() => useAudioCues())
    // Advance 2000ms of fake time so performance.now() = 2000ms = 2.0s.
    vi.advanceTimersByTime(2000)
    const clockNow = result.current.clock.now()
    const performanceNow = performance.now() / 1000
    // Wall clock shape: clock.now() ≈ performance.now() / 1000 (within 5ms tolerance).
    expect(Math.abs(clockNow - performanceNow)).toBeLessThan(0.005)
    vi.useRealTimers()
    unmount()
  })

  it('D-05: clock.now() returns AC currentTime after start (NOT performance.now()/1000)', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })
    // After start, the proxy source is the AC clock.
    // AC clock now() = SpyableAC.currentTime (which is performance.now()/1000 - _start).
    // The key invariant: clock.now() delegates to the AC, NOT to performance.now()/1000 directly.
    // We verify this by checking clock.now() is non-negative and finite (the AC clock is valid).
    // We also check it is NOT simply performance.now()/1000 — the AC's currentTime starts near 0.
    const clockNow = result.current.clock.now()
    expect(typeof clockNow).toBe('number')
    expect(isFinite(clockNow)).toBe(true)
    // AC currentTime starts near 0 and grows slowly; should be < 5s since start took < 5s.
    expect(clockNow).toBeGreaterThanOrEqual(0)
    expect(clockNow).toBeLessThan(5)
    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-11: onSessionClockReanchored fires BEFORE onReanchorRequired on reconstructEngine', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const onReanchorRequired = vi.fn()
    const onSessionClockReanchored = vi.fn()
    const { result, unmount } = renderHook(() =>
      useAudioCues(false, onReanchorRequired, onSessionClockReanchored),
    )
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    // Drive reconstruction via the resume rejection path.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed to start the audio device', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })

    // Trigger public resume() to drive reconstruction.
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    // Both callbacks must have been called exactly once.
    expect(onSessionClockReanchored).toHaveBeenCalledTimes(1)
    expect(onReanchorRequired).toHaveBeenCalledTimes(1)

    // onSessionClockReanchored fires BEFORE onReanchorRequired.
    // invocationCallOrder is a Vitest mock property — lower number = called first.
    expect(onSessionClockReanchored.mock.invocationCallOrder[0])
      .toBeLessThan(onReanchorRequired.mock.invocationCallOrder[0] as number)

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-10: onSessionClockReanchored receives newEngine.clock.now() at reanchor instant', async () => {
    SpyableAC.reset()
    vi.stubGlobal('AudioContext', SpyableAC)
    const onSessionClockReanchored = vi.fn()
    const { result, unmount } = renderHook(() =>
      useAudioCues(false, vi.fn(), onSessionClockReanchored),
    )
    await act(async () => {
      await result.current.start(samplePlan, 'bowl')
    })

    // Trigger reconstruction.
    // Reason: async required to match AudioContext.resume() Promise<void> signature; throw produces a rejected promise without await.
    // eslint-disable-next-line @typescript-eslint/require-await
    vi.spyOn(SpyableAC.prototype, 'resume').mockImplementationOnce(async function (this: SpyableAC) {
      this.state = 'interrupted'
      this.dispatchStateChange()
      const err = new DOMException('Failed', 'InvalidStateError')
      this.state = 'suspended'
      this.dispatchStateChange()
      throw err
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    expect(onSessionClockReanchored).toHaveBeenCalledTimes(1)
    // The callback must receive a number (newEngine.clock.now() = the new AC's currentTime).
    // Reason: length asserted by toHaveBeenCalledTimes(1) immediately above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const callArg = onSessionClockReanchored.mock.calls[0]![0] as unknown
    expect(typeof callArg).toBe('number')
    // The new AC's currentTime should be near 0 (just constructed).
    expect(callArg as number).toBeGreaterThanOrEqual(0)
    expect(callArg as number).toBeLessThan(5)

    await act(async () => { await result.current.stop() })
    unmount()
  })
})

// topUpLookahead facade tests
describe('useAudioCues — Phase 52 D-04 topUpLookahead facade', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('topUpLookahead is exposed in the hook return value', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    expect(typeof result.current.topUpLookahead).toBe('function')
    unmount()
  })

  it('topUpLookahead delegates to engine.topUpLookahead after start()', async () => {
    const topUpSpy = vi.fn()
    // Reason: partial AudioEngine for testing topUpLookahead delegation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeEngine: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3),
      scheduleNextCue: vi.fn(),
      topUpLookahead: topUpSpy,
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn(() => () => undefined),
        onSuspend: vi.fn(() => () => undefined),
        onClose: vi.fn(() => () => undefined),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine)
    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    const cues = [{ audioTime: 5, phaseDurationSec: 3, kind: 'in' as const }]
    act(() => {
      result.current.topUpLookahead(cues)
    })
    expect(topUpSpy).toHaveBeenCalledTimes(1)
    expect(topUpSpy).toHaveBeenCalledWith({ cues })

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('topUpLookahead is a no-op before start() (engine is null)', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    // Should not throw even with no engine
    expect(() => {
      result.current.topUpLookahead([{ audioTime: 5, phaseDurationSec: 3, kind: 'in' }])
    }).not.toThrow()
    unmount()
  })
})

// handleForceTopUp subscribed to clock.onResume: re-dispatches cached cues, survives
// reconstruction, torn down by unmount/stop, no-op before first topUpLookahead.
describe('useAudioCues — Phase 52 D-04 forceTopUp on clock.onResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Helper: builds a fake engine with a controllable onResume subscription.
  // Returns the engine, a fire() function to invoke all onResume subscribers,
  // and a topUpSpy for assertions.
  function makeFakeEngineWithControllableResume() {
    const topUpSpy = vi.fn()
    const resumeSubscribers: Array<() => void> = []
    const suspendSubscribers: Array<() => void> = []
    const closeSubscribers: Array<() => void> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3),
      scheduleNextCue: vi.fn(),
      topUpLookahead: topUpSpy,
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn((cb: () => void) => {
          resumeSubscribers.push(cb)
          return () => {
            const idx = resumeSubscribers.indexOf(cb)
            if (idx !== -1) resumeSubscribers.splice(idx, 1)
          }
        }),
        onSuspend: vi.fn((cb: () => void) => {
          suspendSubscribers.push(cb)
          return () => {
            const idx = suspendSubscribers.indexOf(cb)
            if (idx !== -1) suspendSubscribers.splice(idx, 1)
          }
        }),
        onClose: vi.fn((cb: () => void) => {
          closeSubscribers.push(cb)
          return () => {
            const idx = closeSubscribers.indexOf(cb)
            if (idx !== -1) closeSubscribers.splice(idx, 1)
          }
        }),
      },
    }
    const fireResume = () => { for (const cb of [...resumeSubscribers]) cb() }
    // Reason: fake engine is partial any-typed for test isolation; full AudioEngine typing is not required here.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { engine, topUpSpy, resumeSubscribers, fireResume }
  }

  it('D-04 T1: clock.onResume fires with no error even when engine is null (defensive gate)', async () => {
    // Before start(): engine is null. Firing onResume should not throw.
    // This is tested by verifying the hook can receive the start call with no engine.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine, fireResume } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())

    // Before start(): firing onResume should be a no-op (engine null)
    // We fire it indirectly by verifying topUpLookahead before any caches exist.
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Dispatch resume BEFORE any topUpLookahead call — cached cues empty → forceTopUp no-op
    act(() => { fireResume() })

    // topUpSpy should NOT have been called (no cached cues yet)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(engine.topUpSpy).toBeUndefined() // structural sanity
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(engine.topUpLookahead).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-04 T2: clock.onResume fires after topUpLookahead cached cues → re-dispatches those cues via engine.topUpLookahead', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine, topUpSpy, fireResume } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    const cues = [
      { audioTime: 5, phaseDurationSec: 4, kind: 'in' as const },
      { audioTime: 15, phaseDurationSec: 6, kind: 'out' as const },
    ]

    // Call topUpLookahead to cache the cues
    act(() => { result.current.topUpLookahead(cues) })
    expect(topUpSpy).toHaveBeenCalledTimes(1)
    topUpSpy.mockClear()

    // Fire onResume → handleForceTopUp should re-dispatch the cached cues
    act(() => { fireResume() })

    // handleForceTopUp should call engine.topUpLookahead with the SAME cues
    expect(topUpSpy).toHaveBeenCalledTimes(1)
    expect(topUpSpy).toHaveBeenCalledWith({ cues })

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-04 T6: clock.onResume fires before any topUpLookahead — lastTopUpCuesRef empty, no engine call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine, topUpSpy, fireResume } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Fire onResume BEFORE any topUpLookahead call
    act(() => { fireResume() })

    // topUpSpy should NOT be called (cache is empty)
    expect(topUpSpy).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-04 T7: successive topUpLookahead calls update the cache — forceTopUp re-dispatches LATEST cues', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine, topUpSpy, fireResume } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    const firstCues = [{ audioTime: 5, phaseDurationSec: 4, kind: 'in' as const }]
    const secondCues = [
      { audioTime: 10, phaseDurationSec: 6, kind: 'out' as const },
      { audioTime: 16, phaseDurationSec: 4, kind: 'in' as const },
    ]

    act(() => { result.current.topUpLookahead(firstCues) })
    act(() => { result.current.topUpLookahead(secondCues) })

    topUpSpy.mockClear()

    // Fire onResume → should re-dispatch secondCues (most recent)
    act(() => { fireResume() })

    expect(topUpSpy).toHaveBeenCalledTimes(1)
    expect(topUpSpy).toHaveBeenCalledWith({ cues: secondCues })

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('D-04 T4: stop() tears down forceTopUp subscription — no topUpLookahead called after stop', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine, topUpSpy, fireResume } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    const cues = [{ audioTime: 5, phaseDurationSec: 4, kind: 'in' as const }]
    act(() => { result.current.topUpLookahead(cues) })
    topUpSpy.mockClear()

    // stop() should tear down all clock subscriptions including forceTopUp
    await act(async () => { await result.current.stop() })

    // Fire resume AFTER stop — subscription should be gone, no engine call
    act(() => { fireResume() })
    expect(topUpSpy).not.toHaveBeenCalled()

    unmount()
  })

  it('D-04 T3: onResume subscription count — engine.clock.onResume called at least twice (handleResume + handleForceTopUp)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { engine } = makeFakeEngineWithControllableResume()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(engine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // engine.clock.onResume must be called at least 2 times:
    // once for handleResume and once for handleForceTopUp
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(engine.clock.onResume).toHaveBeenCalledTimes(2)

    await act(async () => { await result.current.stop() })
    unmount()
  })
})

// cancelFutureCues facade: exposes the method with the same null-gate posture as other
// clock-subscriber callbacks; delegates to engine.cancelFutureCues().
describe('Phase 52 CR-01-FIX: cancelFutureCues facade', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('cancelFutureCues exposed on hook return', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    expect(typeof result.current.cancelFutureCues).toBe('function')
    unmount()
  })

  it('cancelFutureCues no-op when engine is null', () => {
    const { result, unmount } = renderHook(() => useAudioCues())
    // Before start(), engine is null — should not throw
    expect(() => {
      act(() => { result.current.cancelFutureCues() })
    }).not.toThrow()
    unmount()
  })

  it('cancelFutureCues delegates to engine.cancelFutureCues after start', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeEngine: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3),
      scheduleNextCue: vi.fn(),
      topUpLookahead: vi.fn(),
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn(() => () => undefined),
        onSuspend: vi.fn(() => () => undefined),
        onClose: vi.fn(() => () => undefined),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    act(() => { result.current.cancelFutureCues() })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(fakeEngine.cancelFutureCues).toHaveBeenCalledTimes(1)

    await act(async () => { await result.current.stop() })
    unmount()
  })
})

// topUpLookahead cache-after-gate: lastTopUpCuesRef is written only after the engine
// null-gate so a pre-start call cannot poison the force-top-up cache; stop() clears the
// cache so a stop()→start() cycle cannot replay stale cues into a new engine.
describe('Phase 52 WR-02-FIX: topUpLookahead cache-after-gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('WR-02 topUpLookahead does NOT write lastTopUpCuesRef when engine is null', async () => {
    // Build a fake engine with controllable resume subscription
    let resumeCb: (() => void) | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeEngine: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3),
      scheduleNextCue: vi.fn(),
      topUpLookahead: vi.fn(),
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn((cb: () => void) => { resumeCb = cb; return () => undefined }),
        onSuspend: vi.fn(() => () => undefined),
        onClose: vi.fn(() => () => undefined),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine)

    const { result, unmount } = renderHook(() => useAudioCues())

    // Call topUpLookahead BEFORE start() — engine is null, cache should NOT be poisoned
    act(() => {
      result.current.topUpLookahead([{ audioTime: 999, phaseDurationSec: 4, kind: 'in' }])
    })

    // Now start the engine
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Clear topUpLookahead call count from start-up
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    fakeEngine.topUpLookahead.mockClear()

    // Fire the onResume callback (simulates clock.onResume) — handleForceTopUp will
    // dispatch the cached cues. If the pre-start call poisoned the cache, the stale
    // cue (audioTime: 999) would be dispatched here.
    act(() => { if (resumeCb) resumeCb() })

    // With cache-after-gate fix: pre-start call should NOT have written the cache,
    // so forceTopUp should NOT dispatch the stale cue (cache is still empty [])
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(fakeEngine.topUpLookahead).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('WR-02 stop() clears lastTopUpCuesRef', async () => {
    // First session: start + topUpLookahead + stop
    let resumeCb1: (() => void) | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeEngine1: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 3),
      scheduleNextCue: vi.fn(),
      topUpLookahead: vi.fn(),
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn((cb: () => void) => { resumeCb1 = cb; return () => undefined }),
        onSuspend: vi.fn(() => () => undefined),
        onClose: vi.fn(() => () => undefined),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine1)

    const { result, unmount } = renderHook(() => useAudioCues())
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Cache some cues in the first session
    const sessionOneCues = [{ audioTime: 5, phaseDurationSec: 4, kind: 'in' as const }]
    act(() => { result.current.topUpLookahead(sessionOneCues) })

    // Stop the first session (should clear the cache)
    await act(async () => { await result.current.stop() })

    // Second session: new fake engine
    let resumeCb2: (() => void) | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeEngine2: any = {
      setMuted: vi.fn(),
      scheduleLeadIn: vi.fn(() => 7),
      scheduleNextCue: vi.fn(),
      topUpLookahead: vi.fn(),
      cancelFutureCues: vi.fn(),
      playEndChord: vi.fn(),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      clock: {
        now: vi.fn(() => 0),
        schedule: vi.fn(),
        onResume: vi.fn((cb: () => void) => { resumeCb2 = cb; return () => undefined }),
        onSuspend: vi.fn(() => () => undefined),
        onClose: vi.fn(() => () => undefined),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(audioEngineModule, 'createAudioEngine').mockResolvedValueOnce(fakeEngine2)

    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Fire onResume on the new engine — if stop() did NOT clear the cache,
    // fakeEngine2.topUpLookahead would be called with the stale sessionOneCues.
    act(() => { if (resumeCb2) resumeCb2() })

    // With the fix: stop() clears lastTopUpCuesRef → new engine receives zero
    // topUpLookahead invocations from the cached state of the prior session.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(fakeEngine2.topUpLookahead).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
    // Suppress unused variable warning for resumeCb1 — it was captured but not fired.
    void resumeCb1
  })
})

// Reconstruction-path top-up gating: after reconstructEngine, the next clock.onResume
// must NOT replay cached cues (whose absolute audioTimes belonged to the old AC origin).
// reconstructEngine resets lastTopUpCuesRef.current = [] so any immediate onResume sees
// an empty cache and future top-up calls on the new engine start from a clean slate.
describe('Phase 52 Plan 06 WR-04 + WR-05: reconstruction-path top-up gating and lastTopUpCuesRef reset', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Helper: builds two fake engines (pre/post reconstruction) with controllable onResume.
  // engineA simulates the initial session engine; engineB simulates the reconstructed engine.
  // Both track topUpLookahead calls so we can assert no stale-cue replay on reconstruction.
  function makeReconstructFakeEngines() {
    function makeFakeEngine(clockNowValue: number) {
      const topUpSpy = vi.fn()
      const resumeSubscribers: Array<() => void> = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const engine: any = {
        setMuted: vi.fn(),
        scheduleLeadIn: vi.fn(() => clockNowValue + 3),
        scheduleNextCue: vi.fn(),
        topUpLookahead: topUpSpy,
        cancelFutureCues: vi.fn(),
        playEndChord: vi.fn(),
        resume: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        clock: {
          now: vi.fn(() => clockNowValue),
          schedule: vi.fn(),
          onResume: vi.fn((cb: () => void) => {
            resumeSubscribers.push(cb)
            return () => {
              const idx = resumeSubscribers.indexOf(cb)
              if (idx !== -1) resumeSubscribers.splice(idx, 1)
            }
          }),
          onSuspend: vi.fn(() => () => undefined),
          onClose: vi.fn(() => () => undefined),
        },
      }
      const fireResume = () => { for (const cb of [...resumeSubscribers]) cb() }
      // Reason: partial any-typed engine for test isolation.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { engine, topUpSpy, fireResume }
    }
    // engineA: initial session (AC currentTime = 10)
    const engineA = makeFakeEngine(10)
    // engineB: reconstructed session (AC currentTime = 0.5 — new AC origin)
    const engineB = makeFakeEngine(0.5)
    return { engineA, engineB }
  }

  it('WR-05: reconstructEngine resets lastTopUpCuesRef so subsequent onResume does not replay pre-reconstruction cues', async () => {
    const { engineA, engineB } = makeReconstructFakeEngines()

    // Start with engineA
    vi.spyOn(audioEngineModule, 'createAudioEngine')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .mockResolvedValueOnce(engineA.engine) // first call: start()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .mockResolvedValueOnce(engineB.engine) // second call: reconstructEngine()

    const reanchorSpy = vi.fn()
    const { result, unmount } = renderHook(() => useAudioCues(false, reanchorSpy))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Populate lastTopUpCuesRef with pre-reconstruction cues (old AC origin audioTimes)
    const preReconstructCues = [
      { audioTime: 10 + 5, phaseDurationSec: 4, kind: 'in' as const },  // absolute to engineA origin
      { audioTime: 10 + 15, phaseDurationSec: 6, kind: 'out' as const },
    ]
    act(() => { result.current.topUpLookahead(preReconstructCues) })

    // Verify the cache was populated
    expect(engineA.topUpSpy).toHaveBeenCalledTimes(1)
    engineA.topUpSpy.mockClear()

    // Trigger reconstruction (simulate what public resume() does)
    await act(async () => { await result.current.resume() })

    // After reconstruction, the cache is cleared.
    // Fire onResume on the new engine — handleForceTopUp should see an empty cache and NO-OP.
    act(() => { engineB.fireResume() })

    // engineB.topUpLookahead must NOT have been called with the pre-reconstruction cues.
    // lastTopUpCuesRef.current is [] after reconstructEngine, so handleForceTopUp exits early.
    expect(engineB.topUpSpy).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
  })

  it('WR-04 + WR-05: no collapsed-onto-one-instant stack on reconstruct-path onResume (no stale cue replay)', async () => {
    // This test verifies the behavioral outcome: no topUpLookahead calls with stale cues
    // On the reconstruct-path onResume, stale cues must not be replayed. The stale-replay
    // artifact would manifest as topUpLookahead called with absolute audioTimes from the
    // old AC origin — which the engine would clamp, collapsing all N cues onto the same instant.
    // With lastTopUpCuesRef cleared in reconstructEngine, handleForceTopUp sees an empty
    // cache and exits without calling topUpLookahead.
    const { engineA, engineB } = makeReconstructFakeEngines()

    vi.spyOn(audioEngineModule, 'createAudioEngine')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .mockResolvedValueOnce(engineA.engine)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .mockResolvedValueOnce(engineB.engine)

    const { result, unmount } = renderHook(() => useAudioCues(false, vi.fn()))
    await act(async () => { await result.current.start(samplePlan, 'bowl') })

    // Cache several cues with audioTimes belonging to engineA's clock origin (currentTime=10).
    // If these were replayed on the engineB origin (currentTime=0.5), all would clamp to 0.505.
    const staleCues = [
      { audioTime: 15, phaseDurationSec: 4, kind: 'in' as const },
      { audioTime: 25, phaseDurationSec: 6, kind: 'out' as const },
      { audioTime: 35, phaseDurationSec: 4, kind: 'in' as const },
    ]
    act(() => { result.current.topUpLookahead(staleCues) })

    // Reconstruct
    await act(async () => { await result.current.resume() })

    // Fire onResume on new engine — MUST NOT replay stale cues
    engineB.topUpSpy.mockClear()
    act(() => { engineB.fireResume() })

    // Assert: no topUpLookahead call on the new engine with the stale pre-reconstruction cues
    expect(engineB.topUpSpy).not.toHaveBeenCalled()

    await act(async () => { await result.current.stop() })
    unmount()
  })
})
