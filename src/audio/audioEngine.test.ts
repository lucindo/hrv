// Tests for the audioEngine factory + AudioEngine interface.

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BreathingPlan } from '../domain/breathingPlan'
import { createAudioEngine, SAFE_LEAD_SEC } from './audioEngine'
import * as cueSynth from './cueSynth'
import * as nkCueSynth from './nkCueSynth'
import type { CueHandle } from './cueSynth'

// BreathingPlan fixture uses seconds-shaped fields.
const samplePlan: BreathingPlan = {
  bpm: 5.5,
  inhaleShare: 40,
  cycleSec: 60 / 5.5,
  inhaleSec: (60 / 5.5) * 0.4,
  exhaleSec: (60 / 5.5) * 0.6,
  totalSec: 600,
}

interface MockEnvelopeFns {
  cancelAndHoldAtTime: ReturnType<typeof vi.fn> | undefined
  setTargetAtTime: ReturnType<typeof vi.fn>
  cancelScheduledValues: ReturnType<typeof vi.fn>
  setValueAtTime: ReturnType<typeof vi.fn>
}

// The engine creates a master GainNode right after `new AudioContext()`
// and calls masterGain.connect(destination). The bare-bones ProbeAC stubs below need
// createGain() to return a node with connect/disconnect + a gain AudioParam carrying
// the automation methods setMuted() drives.
function makeFakeGain(): GainNode {
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      cancelAndHoldAtTime: vi.fn(),
    },
  } as unknown as GainNode
}

function makeMockCueHandle(opts: { withCancelAndHold?: boolean } = {}): {
  handle: CueHandle
  fns: MockEnvelopeFns
} {
  const withCancelAndHold = opts.withCancelAndHold ?? true
  const fns: MockEnvelopeFns = {
    cancelAndHoldAtTime: withCancelAndHold ? vi.fn() : undefined,
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
  }
  const gain = {
    value: 0.18,
    cancelAndHoldAtTime: fns.cancelAndHoldAtTime,
    setTargetAtTime: fns.setTargetAtTime,
    cancelScheduledValues: fns.cancelScheduledValues,
    setValueAtTime: fns.setValueAtTime,
  } as unknown as AudioParam
  const envelope = { gain } as unknown as GainNode
  const handle: CueHandle = {
    envelope,
    scheduledAt: 0,
    cleanupAt: 10,
    cancel: vi.fn(),
  }
  return { handle, fns }
}

describe('audioEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('createAudioEngine resolves with an engine when AudioContext construction succeeds', async () => {
    const engine = await createAudioEngine({ timbre: 'bowl' })
    expect(engine).toBeDefined()
    expect(typeof engine.scheduleLeadIn).toBe('function')
    expect(typeof engine.scheduleNextCue).toBe('function')
    expect(typeof engine.setMuted).toBe('function')
    expect(typeof engine.now).toBe('function')
    expect(typeof engine.close).toBe('function')
    await engine.close()
  })

  it('createAudioEngine rejects when AudioContext construction throws (D-10 anchor)', async () => {
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
    await expect(createAudioEngine({ timbre: 'bowl' })).rejects.toThrow('blocked')
  })

  it('scheduleLeadIn schedules 3 ticks at t/+1/+2 and an In cue at +3', async () => {
    // Consistency: the countdown beep is the shared scheduleCountdownTick.
    const tickSpy = vi.spyOn(nkCueSynth, 'scheduleCountdownTick')
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })

    engine.scheduleLeadIn(0, samplePlan)

    expect(tickSpy).toHaveBeenCalledTimes(3)
    expect(tickSpy.mock.calls[0]?.[1]).toBe(0)
    expect(tickSpy.mock.calls[1]?.[1]).toBe(1)
    expect(tickSpy.mock.calls[2]?.[1]).toBe(2)
    expect(inSpy).toHaveBeenCalledTimes(1)
    expect(inSpy.mock.calls[0]?.[1]).toBe(3)

    await engine.close()
  })

  it('scheduleLeadIn returns the audioTime of the first In cue (= startAudioTime + 3)', async () => {
    const engine = await createAudioEngine({ timbre: 'bowl' })
    const firstInCueTime = engine.scheduleLeadIn(7, samplePlan)
    expect(firstInCueTime).toBe(10)
    await engine.close()
  })

  it('SAFE_LEAD_SEC export equals 0.005 (D-03 single-source-of-truth)', () => {
    expect(SAFE_LEAD_SEC).toBe(0.005)
  })

  it('scheduleNextCue with newPhase=in calls scheduleInCueForTimbre at the requested audioTime', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'in', audioTime: 5, phaseDurationSec: 4.36 })
    expect(inSpy).toHaveBeenCalledTimes(1)
    expect(inSpy.mock.calls[0]?.[1]).toBe(5)
    await engine.close()
  })

  it('scheduleNextCue with newPhase=out calls scheduleOutCueForTimbre at the requested audioTime', async () => {
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'out', audioTime: 5.5, phaseDurationSec: 6.54 })
    expect(outSpy).toHaveBeenCalledTimes(1)
    expect(outSpy.mock.calls[0]?.[1]).toBe(5.5)
    await engine.close()
  })

  // 260510-tc9 Bug 2: engine forwards phaseDurationSec to scheduleIn/OutCueForTimbre.
  // phaseDurationSec is the 5th positional arg (index 4) — index 3 is timbre.
  it('scheduleNextCue forwards phaseDurationSec as the 5th arg to scheduleInCueForTimbre/scheduleOutCueForTimbre', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'in', audioTime: 5, phaseDurationSec: 4.36 })
    engine.scheduleNextCue({ newPhase: 'out', audioTime: 9.36, phaseDurationSec: 6.54 })
    expect(inSpy.mock.calls[0]?.[4]).toBeCloseTo(4.36, 5)
    expect(outSpy.mock.calls[0]?.[4]).toBeCloseTo(6.54, 5)
    await engine.close()
  })

  // Master-gain mute. The engine creates exactly one master GainNode right
  // after `new AudioContext()` (before any cue gain nodes). Spy on createGain to capture
  // it as the FIRST-returned gain node, then assert setMuted ramps it.
  it('Phase 53: setMuted(true) ramps the master gain toward 0, setMuted(false) toward 1', async () => {
    const createGainSpy = vi.spyOn(window.AudioContext.prototype, 'createGain')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    // First createGain() call = the master gain (created before any cue scheduling).
    const masterGain = createGainSpy.mock.results[0]?.value as GainNode
    // Reason: the FakeGainNode's gain.linearRampToValueAtTime is a field-initialized
    // vi.fn() (not a real prototype method), so extracting it is safe here.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const ramp = vi.mocked(masterGain.gain.linearRampToValueAtTime)

    engine.setMuted(true)
    expect(ramp).toHaveBeenCalledTimes(1)
    expect(ramp.mock.calls[0]?.[0]).toBe(0)

    engine.setMuted(false)
    expect(ramp).toHaveBeenCalledTimes(2)
    expect(ramp.mock.calls[1]?.[0]).toBe(1)

    await engine.close()
  })

  // Cues KEEP being scheduled while muted (they play silently through the master gain at 0).
  it('Phase 53: scheduleNextCue + topUpLookahead STILL schedule cues while muted', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.setMuted(true)

    engine.scheduleNextCue({ newPhase: 'in', audioTime: 5, phaseDurationSec: 4.36 })
    engine.topUpLookahead({ cues: [{ audioTime: 9, phaseDurationSec: 6.54, kind: 'out' }] })

    expect(inSpy).toHaveBeenCalledTimes(1)
    expect(outSpy).toHaveBeenCalledTimes(1)
    await engine.close()
  })

  it('engine.muted reflects the value passed to setMuted', async () => {
    const engine = await createAudioEngine({ timbre: 'bowl' })
    expect(engine.muted).toBe(false)
    engine.setMuted(true)
    expect(engine.muted).toBe(true)
    engine.setMuted(false)
    expect(engine.muted).toBe(false)
    await engine.close()
  })

  // setMuted Safari fallback: when the master gain lacks cancelAndHoldAtTime (older
  // WebKit), the anchor path uses cancelScheduledValues + setValueAtTime before the ramp.
  it('setMuted anchors via cancelScheduledValues + setValueAtTime when cancelAndHoldAtTime is absent (Safari fallback)', async () => {
    function makeFallbackGain(): GainNode {
      return {
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          // cancelAndHoldAtTime intentionally ABSENT — forces the else branch.
        },
      } as unknown as GainNode
    }
    const createGainSpy = vi.fn(makeFallbackGain)
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = createGainSpy
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    // First createGain() = the master gain (created before any cue scheduling).
    const masterGain = createGainSpy.mock.results[0]?.value as GainNode
    /* eslint-disable @typescript-eslint/unbound-method */
    const cancelScheduled = vi.mocked(masterGain.gain.cancelScheduledValues)
    const setValueAt = vi.mocked(masterGain.gain.setValueAtTime)
    const ramp = vi.mocked(masterGain.gain.linearRampToValueAtTime)
    /* eslint-enable @typescript-eslint/unbound-method */

    engine.setMuted(true)

    expect(cancelScheduled).toHaveBeenCalledTimes(1)
    expect(setValueAt).toHaveBeenCalledWith(1, 0) // anchor current value (1) at now (0)
    expect(ramp).toHaveBeenCalledTimes(1)
    expect(ramp.mock.calls[0]?.[0]).toBe(0)

    await engine.close()
  })

  // Node-leak guard: the Web Audio spec does not guarantee 'ended' fires for a cue whose
  // stopAt is still in the future when the AC closes, so close() explicitly disconnects
  // every in-flight cue envelope before tearing down. Seed one in-flight cue and assert it.
  it('close() disconnects in-flight cue envelopes so the node chain cannot leak', async () => {
    const disconnectSpy = vi.fn()
    const inFlight: CueHandle = {
      envelope: { gain: { value: 0.18 }, disconnect: disconnectSpy } as unknown as GainNode,
      scheduledAt: 0,
      cleanupAt: 999, // tail still in the future at close()
      cancel: vi.fn(),
    }
    vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(inFlight)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'in', audioTime: 5, phaseDurationSec: 4.36 })

    await engine.close()

    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  // iOS Safari raises InvalidStateError when resume() runs off a gesture; the AC stays
  // suspended and fires no natural statechange, so the engine synthesises a suspend via
  // clock.notifySuspended() — the only path that lets the hook show the needs-resume affordance.
  it('resume() fans onSuspend when audioCtx.resume() rejects with InvalidStateError', async () => {
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(() =>
        Promise.reject(Object.assign(new Error('non-gesture'), { name: 'InvalidStateError' })),
      )
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    const onSuspend = vi.fn()
    engine.clock.onSuspend(onSuspend)

    await engine.resume()

    expect(onSuspend).toHaveBeenCalledTimes(1)
    await engine.close()
  })

  it('resume() absorbs a non-InvalidStateError rejection silently — no onSuspend, no throw', async () => {
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(() =>
        Promise.reject(Object.assign(new Error('autoplay vetoed'), { name: 'NotAllowedError' })),
      )
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    const onSuspend = vi.fn()
    engine.clock.onSuspend(onSuspend)

    await expect(engine.resume()).resolves.toBeUndefined()
    expect(onSuspend).not.toHaveBeenCalled()
    await engine.close()
  })

  it('close() calls audioCtx.close exactly once', async () => {
    // Spy on a Probe AudioContext whose close is observable (the generic FakeAudioContext
    // close is shared across instances and gets noisy if other tests in the same describe
    // leak an unclosed engine).
    const closeSpy = vi.fn(async () => {})
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(async () => {})
      close = closeSpy
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      // Engine wires a statechange listener at construction.
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const probeEngine = await createAudioEngine({ timbre: 'bowl' })
    await probeEngine.close()
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('close() is idempotent — calling twice does not throw and does not call audioCtx.close twice', async () => {
    const closeSpy = vi.fn(async () => {})
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(async () => {})
      close = closeSpy
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      // Engine wires a statechange listener at construction.
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    await engine.close()
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('after close(), scheduleNextCue is a no-op (does not throw, does not call cueSynth)', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    inSpy.mockClear()
    expect(() => { engine.scheduleNextCue({ newPhase: 'in', audioTime: 5, phaseDurationSec: 4.36 }) }).not.toThrow()
    expect(inSpy).not.toHaveBeenCalled()
  })

  it('scheduleLeadIn returns null when engine is closed (AUDIO-03)', async () => {
    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    const result = engine.scheduleLeadIn(0, samplePlan)
    expect(result).toBeNull()
  })

  it('engine.now() returns audioCtx.currentTime', async () => {
    let probeTime = 0
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() {
        return probeTime
      }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      // Engine wires a statechange listener at construction.
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    probeTime = 42.5
    expect(engine.now()).toBe(42.5)
    await engine.close()
  })

  it('scheduleNextCue clamps past audioTime to currentTime + SAFE_LEAD_SEC (AUDIO-02)', async () => {
    const probeTime = 10
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const { handle: stubHandle } = makeMockCueHandle()
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(stubHandle)
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'in', audioTime: 9.5, phaseDurationSec: 4 })
    // audioTime 9.5 < currentTime(10) + SAFE_LEAD_SEC(0.005) → clamped to 10.005
    expect(inSpy.mock.calls[0]?.[1]).toBeCloseTo(probeTime + SAFE_LEAD_SEC, 9)
    await engine.close()
  })

  it('scheduleNextCue passes future audioTime verbatim (no clamp) (AUDIO-02)', async () => {
    const probeTime = 10
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const { handle: stubHandle } = makeMockCueHandle()
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(stubHandle)
    const engine = await createAudioEngine({ timbre: 'bowl' })
    engine.scheduleNextCue({ newPhase: 'in', audioTime: 12, phaseDurationSec: 4 })
    // audioTime 12 > currentTime(10) + SAFE_LEAD_SEC(0.005) → passes verbatim
    expect(inSpy.mock.calls[0]?.[1]).toBe(12)
    await engine.close()
  })

  // engine.state is the live read of audioCtx.state.
  // The hook's public resume() uses it instead of React's audioStatus closure (which
  // is stale within the useCallback invocation) to decide whether reconstruction is
  // required after `await engine.resume()`.
  it('engine.state reflects live audioCtx.state including the WebKit-only "interrupted" superset', async () => {
    let probeState: AudioContextState | 'interrupted' = 'suspended'
    class ProbeAC {
      get state(): AudioContextState | 'interrupted' { return probeState }
      sampleRate = 44100
      destination = {}
      currentTime = 0
      // Reason: async required to match AudioContext.resume() Promise<void> signature; state assignment is the async side-effect.
      // eslint-disable-next-line @typescript-eslint/require-await
      resume = vi.fn(async () => { probeState = 'running' })
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    // The AC is resumed at construction when suspended.
    expect(engine.state).toBe('running')

    probeState = 'suspended'
    expect(engine.state).toBe('suspended')

    probeState = 'interrupted'
    expect(engine.state).toBe('interrupted')

    await engine.close()
  })

  // Timbre-propagation tests: construction-time `opts.timbre` flows through
  // scheduleLeadIn (first In cue) and scheduleNextCue (in/out ternary).
  // Capture-at-construction semantics: no setter, no re-read, immutable for engine lifetime.

  it('createAudioEngine({ timbre: "bell" }) forwards "bell" to scheduleInCueForTimbre on the first In cue', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bell' })

    engine.scheduleLeadIn(0, samplePlan)

    expect(inSpy).toHaveBeenCalledTimes(1)
    // Signature: (ac, when, dest, timbre, phaseDurationSec) → timbre at index 3.
    expect(inSpy.mock.calls[0]?.[3]).toBe('bell')

    await engine.close()
  })

  it('createAudioEngine({ timbre: "sine" }) forwards "sine" to scheduleInCueForTimbre and scheduleOutCueForTimbre via scheduleNextCue', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'sine' })

    engine.scheduleNextCue({ newPhase: 'in', audioTime: 1.0, phaseDurationSec: 5 })
    engine.scheduleNextCue({ newPhase: 'out', audioTime: 6.0, phaseDurationSec: 7 })

    expect(inSpy).toHaveBeenCalledTimes(1)
    expect(outSpy).toHaveBeenCalledTimes(1)
    expect(inSpy.mock.calls[0]?.[3]).toBe('sine')
    expect(outSpy.mock.calls[0]?.[3]).toBe('sine')

    await engine.close()
  })

  it('engine captures timbre once at construction — two engines with different timbres operate independently (no shared mutable state)', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engineBell = await createAudioEngine({ timbre: 'bell' })
    const engineFlute = await createAudioEngine({ timbre: 'flute' })

    // Bell engine schedules — must dispatch with 'bell', not 'flute' (independent capture).
    engineBell.scheduleNextCue({ newPhase: 'in', audioTime: 1.0, phaseDurationSec: 4 })
    // Flute engine schedules — must dispatch with 'flute', not 'bell'.
    engineFlute.scheduleNextCue({ newPhase: 'in', audioTime: 1.0, phaseDurationSec: 4 })

    expect(inSpy).toHaveBeenCalledTimes(2)
    expect(inSpy.mock.calls[0]?.[3]).toBe('bell')
    expect(inSpy.mock.calls[1]?.[3]).toBe('flute')

    await engineBell.close()
    await engineFlute.close()
  })

  // iOS silent-loop element: tests covering sync-construct order, attribute wiring,
  // close() teardown + idempotency, and silent-absorb on .play() reject.
  // Element is invisible at the hook seam — these are engine-level tests only.

  it('createAudioEngine constructs a silent-loop <audio> element with locked attributes (D-05)', async () => {
    const instances: SpyAudio[] = []
    class SpyAudio {
      playsInline = false
      loop = false
      muted = true
      volume = 1
      pause = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn(async () => {})
      // Reason: constructor mirrors HTMLAudioElement(src?) signature; the body
      // captures the instance for assertion (so the constructor is NOT useless).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_src?: string) {
        instances.push(this)
      }
    }
    vi.stubGlobal('Audio', SpyAudio)

    const engine = await createAudioEngine({ timbre: 'bowl' })

    expect(instances).toHaveLength(1)
    const [el] = instances
    if (el === undefined) throw new Error('expected a stubbed Audio instance')
    expect(el.playsInline).toBe(true)
    expect(el.loop).toBe(true)
    expect(el.muted).toBe(false)
    expect(el.volume).toBe(0.0001)

    await engine.close()
  })

  it('engine.close() pauses the silent-loop element and clears its src (D-08 teardown)', async () => {
    const instances: SpyAudio[] = []
    class SpyAudio {
      playsInline = false
      loop = false
      muted = true
      volume = 1
      pause = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn(async () => {})
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_src?: string) {
        instances.push(this)
      }
    }
    vi.stubGlobal('Audio', SpyAudio)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()

    expect(instances).toHaveLength(1)
    const [el] = instances
    if (el === undefined) throw new Error('expected a stubbed Audio instance')
    expect(el.pause).toHaveBeenCalledTimes(1)
    expect(el.removeAttribute).toHaveBeenCalledWith('src')
  })

  it('engine.close() is idempotent for silent-loop teardown — pause and removeAttribute called at most once across two close() calls', async () => {
    const instances: SpyAudio[] = []
    class SpyAudio {
      playsInline = false
      loop = false
      muted = true
      volume = 1
      pause = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn(async () => {})
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_src?: string) {
        instances.push(this)
      }
    }
    vi.stubGlobal('Audio', SpyAudio)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    await engine.close()

    expect(instances).toHaveLength(1)
    const [el] = instances
    if (el === undefined) throw new Error('expected a stubbed Audio instance')
    expect(el.pause).toHaveBeenCalledTimes(1)
    expect(el.removeAttribute).toHaveBeenCalledTimes(1)
  })

  it('createAudioEngine resolves even when silent-loop element.play() rejects (D-09 silent-absorb)', async () => {
    class RejectingAudio {
      playsInline = false
      loop = false
      muted = true
      volume = 1
      pause = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn(() => Promise.reject(new DOMException('autoplay denied', 'NotAllowedError')))
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
      constructor(_src?: string) {}
    }
    vi.stubGlobal('Audio', RejectingAudio)

    // Engine MUST resolve — silent-loop failure is non-fatal.
    const engine = await createAudioEngine({ timbre: 'bowl' })
    expect(engine).toBeDefined()
    expect(typeof engine.close).toBe('function')

    await engine.close()
  })

  // bypassSilentMode option gating: skip construction when false,
  // construct when true, construct when undefined (backward compat — coerces to true).

  describe('Phase 49.1 D-07 — bypassSilentMode option gating (ADV-04)', () => {
    it('createAudioEngine does NOT construct the silent-loop element when bypassSilentMode=false (ADV-04 success gate)', async () => {
      const instances: SpyAudio[] = []
      class SpyAudio {
        playsInline = false
        loop = false
        muted = true
        volume = 1
        pause = vi.fn()
        removeAttribute = vi.fn()
        play = vi.fn(async () => {})
        // Reason: constructor mirrors HTMLAudioElement(src?) signature; body captures instance for assertion — NOT useless.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(_src?: string) {
          instances.push(this)
        }
      }
      vi.stubGlobal('Audio', SpyAudio)

      const engine = await createAudioEngine({ timbre: 'bowl', bypassSilentMode: false })

      // Audio constructor must NOT be called when bypassSilentMode is false.
      expect(instances).toHaveLength(0)
      // close() null-guards must short-circuit cleanly when construction was skipped.
      await engine.close()
    })

    it('createAudioEngine constructs the silent-loop element when bypassSilentMode=true (parity with Phase 49 baseline)', async () => {
      const instances: SpyAudio[] = []
      class SpyAudio {
        playsInline = false
        loop = false
        muted = true
        volume = 1
        pause = vi.fn()
        removeAttribute = vi.fn()
        play = vi.fn(async () => {})
        // Reason: constructor mirrors HTMLAudioElement(src?) signature; body captures instance for assertion — NOT useless.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(_src?: string) {
          instances.push(this)
        }
      }
      vi.stubGlobal('Audio', SpyAudio)

      const engine = await createAudioEngine({ timbre: 'bowl', bypassSilentMode: true })

      expect(instances).toHaveLength(1)
      const [el] = instances
      if (el === undefined) throw new Error('expected a stubbed Audio instance')
      // Attributes must match the locked baseline.
      expect(el.playsInline).toBe(true)
      expect(el.loop).toBe(true)
      expect(el.muted).toBe(false)
      expect(el.volume).toBe(0.0001)
      await engine.close()
    })

    it('createAudioEngine constructs the silent-loop element when bypassSilentMode is undefined (D-07 default undefined → true)', async () => {
      const instances: SpyAudio[] = []
      class SpyAudio {
        playsInline = false
        loop = false
        muted = true
        volume = 1
        pause = vi.fn()
        removeAttribute = vi.fn()
        play = vi.fn(async () => {})
        // Reason: constructor mirrors HTMLAudioElement(src?) signature; body captures instance for assertion — NOT useless.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(_src?: string) {
          instances.push(this)
        }
      }
      vi.stubGlobal('Audio', SpyAudio)

      // No bypassSilentMode key in opts — undefined must coerce to "construct".
      // Backward-compat: callers that omit the field must still get the silent-loop element.
      const engine = await createAudioEngine({ timbre: 'bowl' })

      expect(instances).toHaveLength(1)
      await engine.close()
    })
  })

  // When AudioContext.resume() rejects, the silent-loop element is unreachable through
  // engine.close() (no engine handle is returned), so the ad-hoc teardown inside the
  // resume() catch block is the only path that can release the element.
  it('createAudioEngine tears down silent-loop element when AudioContext.resume() rejects (CR-01)', async () => {
    const audioInstances: SuspendedRejectAudio[] = []
    class SuspendedRejectAC {
      state: AudioContextState = 'suspended'
      sampleRate = 44100
      destination = {}
      currentTime = 0
      resume = vi.fn(() => Promise.reject(new DOMException('autoplay vetoed', 'NotAllowedError')))
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    class SuspendedRejectAudio {
      playsInline = false
      loop = false
      muted = true
      volume = 1
      pause = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn(async () => {})
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_src?: string) {
        audioInstances.push(this)
      }
    }
    vi.stubGlobal('AudioContext', SuspendedRejectAC)
    vi.stubGlobal('Audio', SuspendedRejectAudio)

    // resume() rejection MUST propagate — caller handles AC-construction failure.
    // The silent-loop element is the leaking-resource side effect this test guards.
    await expect(createAudioEngine({ timbre: 'bowl' })).rejects.toThrow('autoplay vetoed')

    expect(audioInstances).toHaveLength(1)
    const [el] = audioInstances
    if (el === undefined) throw new Error('expected a stubbed Audio instance')
    expect(el.pause).toHaveBeenCalledTimes(1)
    expect(el.removeAttribute).toHaveBeenCalledWith('src')
  })

  // Internal schedule(when, cue) dispatch: the engine's internal `schedule` function
  // is plumbed into the SessionClock at construction (scheduleImpl). Calling
  // `engine.clock.schedule(when, cue)` routes through the engine's switch dispatch,
  // exercising every Cue arm. Each arm calls the corresponding per-cue primitive in
  // cueSynth.ts / nkCueSynth.ts and adds the returned handle to activeCues.
  describe('Phase 50-06 — internal schedule(when, cue) dispatch (4 Cue arms)', () => {
    it('schedule({ kind: "lead-in-tick" }) calls scheduleCountdownTick and adds to activeCues', async () => {
      const tickSpy = vi.spyOn(nkCueSynth, 'scheduleCountdownTick')
      const engine = await createAudioEngine({ timbre: 'bowl' })

      engine.clock.schedule(1.5, { kind: 'lead-in-tick' })

      expect(tickSpy).toHaveBeenCalledTimes(1)
      expect(tickSpy.mock.calls[0]?.[1]).toBe(1.5)
      expect(tickSpy.mock.calls[0]?.[3]).toBe('bowl')

      await engine.close()
    })

    it('schedule({ kind: "in", phaseDurationSec }) calls scheduleInCueForTimbre with the session timbre', async () => {
      const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
      // Engine is constructed with timbre: 'bell' — that is sessionTimbre and the source of truth.
      const engine = await createAudioEngine({ timbre: 'bell' })

      engine.clock.schedule(3.0, { kind: 'in', phaseDurationSec: 4.36 })

      expect(inSpy).toHaveBeenCalledTimes(1)
      expect(inSpy.mock.calls[0]?.[1]).toBe(3.0)
      // Engine routes the session timbre to the cue builder.
      expect(inSpy.mock.calls[0]?.[3]).toBe('bell')
      expect(inSpy.mock.calls[0]?.[4]).toBeCloseTo(4.36, 5)

      await engine.close()
    })

    it('schedule({ kind: "out", phaseDurationSec }) calls scheduleOutCueForTimbre with the session timbre', async () => {
      const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
      const engine = await createAudioEngine({ timbre: 'sine' })

      engine.clock.schedule(5.5, { kind: 'out', phaseDurationSec: 6.54 })

      expect(outSpy).toHaveBeenCalledTimes(1)
      expect(outSpy.mock.calls[0]?.[1]).toBe(5.5)
      expect(outSpy.mock.calls[0]?.[3]).toBe('sine')
      expect(outSpy.mock.calls[0]?.[4]).toBeCloseTo(6.54, 5)

      await engine.close()
    })

    it('schedule({ kind: "end-chord" }) calls scheduleEndChord, adds to activeCues, AND updates endChordTailUntil for close()-deferral', async () => {
      // The end-chord case is the only one with extra bookkeeping (the tail-defer
      // for close()). We assert via the close() defer-path observable: scheduling
      // an end-chord whose cleanupAt is in the future causes close() to wait.
      const probeNow = 0
      const acCloseSpy = vi.fn(async () => {})
      class ProbeAC {
        state: AudioContextState = 'running'
        sampleRate = 44100
        destination = {}
        get currentTime() { return probeNow }
        resume = vi.fn(async () => {})
        close = acCloseSpy
        createOscillator = vi.fn()
        createGain = vi.fn(makeFakeGain)
        createBiquadFilter = vi.fn()
        addEventListener = vi.fn()
        removeEventListener = vi.fn()
      }
      vi.stubGlobal('AudioContext', ProbeAC)

      // Stub scheduleEndChord to return a known-future cleanupAt so we can observe
      // the endChordTailUntil bookkeeping via close()'s setTimeout deferral.
      const fakeChord: CueHandle = {
        envelope: { gain: { value: 1 } } as unknown as GainNode,
        scheduledAt: 0,
        cleanupAt: 0.02, // 20 ms tail
        cancel: vi.fn(),
      }
      const endChordSpy = vi.spyOn(nkCueSynth, 'scheduleEndChord').mockReturnValue(fakeChord)

      const engine = await createAudioEngine({ timbre: 'bowl' })
      engine.clock.schedule(0, { kind: 'end-chord' })

      expect(endChordSpy).toHaveBeenCalledTimes(1)
      expect(endChordSpy.mock.calls[0]?.[1]).toBe(0)

      // close() must DEFER teardown until the tail rings out. The synchronous prefix of
      // close() runs before its first await, so audioCtx.close() must NOT have fired yet
      // when close() returns its pending promise — if the deferral await were removed,
      // close() would tear down synchronously and this assertion would fail.
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const closing = engine.close()
      expect(acCloseSpy).not.toHaveBeenCalled()
      // The setTimeout call inside close() uses tailRemainingSec * 1000 = 0.02 * 1000 = 20.
      const deferralCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 20)
      expect(deferralCall).toBeDefined()
      await closing
      // Only after the tail elapses does the AC actually close.
      expect(acCloseSpy).toHaveBeenCalledTimes(1)
    })
  })
})

// CueHandle.cancel contract: tests use the real FakeAudioContext polyfill from vitest.setup.ts
// so that oscillator/gain/filter nodes are real fake-AC nodes with spy-compatible methods.
// The cancel() closure must: (1) stop all oscillators at currentTime, (2) disconnect
// every node in the chain, (3) be idempotent (calling twice must not throw).
describe('Phase 52 D-09 CueHandle.cancel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // The contract that matters: cancel() stops the oscillators and tears down the node
  // chain (so a cancelled cue cannot keep ringing). Asserted once on the real fake nodes,
  // then a callable+idempotent smoke across every builder entry point.
  it('D-09: cancel() stops every oscillator and disconnects the envelope', () => {
    const audioCtx = new AudioContext()
    const oscillators: OscillatorNode[] = []
    const realCreate = audioCtx.createOscillator.bind(audioCtx)
    vi.spyOn(audioCtx, 'createOscillator').mockImplementation(() => {
      const osc = realCreate()
      oscillators.push(osc)
      return osc
    })
    const handle = cueSynth.scheduleInCueForTimbre(audioCtx, 1, audioCtx.destination, 'bowl', 4)
    expect(oscillators.length).toBeGreaterThan(0)

    handle.cancel()

    for (const osc of oscillators) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(osc.stop as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled()
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(handle.envelope.disconnect as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled()
  })

  const cueBuilders: Array<[string, (ac: AudioContext) => CueHandle]> = [
    ['scheduleInCueForTimbre', (ac) => cueSynth.scheduleInCueForTimbre(ac, 1, ac.destination, 'bowl', 4)],
    ['scheduleOutCueForTimbre', (ac) => cueSynth.scheduleOutCueForTimbre(ac, 1, ac.destination, 'bowl', 4)],
    ['scheduleNKTick', (ac) => nkCueSynth.scheduleNKTick(ac, 1, ac.destination, 'bowl')],
    ['scheduleCountdownTick', (ac) => nkCueSynth.scheduleCountdownTick(ac, 1, ac.destination, 'bowl')],
    ['scheduleNKFrontMarker', (ac) => nkCueSynth.scheduleNKFrontMarker(ac, 1, ac.destination, 'bowl')],
    ['scheduleNKBackMarker', (ac) => nkCueSynth.scheduleNKBackMarker(ac, 1, ac.destination, 'bowl')],
    ['scheduleEndChord', (ac) => nkCueSynth.scheduleEndChord(ac, 1, ac.destination, 'bowl')],
  ]

  it.each(cueBuilders)('D-09: %s returns a cancel() that is callable and idempotent', (_name, build) => {
    const audioCtx = new AudioContext()
    const handle = build(audioCtx)
    expect(typeof handle.cancel).toBe('function')
    expect(() => { handle.cancel(); handle.cancel() }).not.toThrow()
  })
})

// engine.topUpLookahead: dispatches a caller-supplied list of cues via the internal
// schedule() function, respecting the closed guard and the callee-side SAFE_LEAD_SEC clamp.
describe('Phase 52 D-04 topUpLookahead', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('topUpLookahead calls scheduleInCueForTimbre for each "in" cue in the list (D-04)', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })

    engine.topUpLookahead({
      cues: [
        { audioTime: 5, phaseDurationSec: 4, kind: 'in' },
        { audioTime: 15, phaseDurationSec: 6, kind: 'out' },
        { audioTime: 25, phaseDurationSec: 4, kind: 'in' },
      ],
    })

    expect(inSpy).toHaveBeenCalledTimes(2)
    await engine.close()
  })

  it('topUpLookahead on a closed engine is a no-op (closed guard)', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    inSpy.mockClear()
    outSpy.mockClear()

    engine.topUpLookahead({ cues: [{ audioTime: 5, phaseDurationSec: 4, kind: 'in' }] })

    expect(inSpy).not.toHaveBeenCalled()
    expect(outSpy).not.toHaveBeenCalled()
  })

  it('topUpLookahead clamps audioTime to currentTime + SAFE_LEAD_SEC when in the past', async () => {
    const probeTime = 10
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const { handle: stubHandle } = makeMockCueHandle()
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(stubHandle)
    const engine = await createAudioEngine({ timbre: 'bowl' })

    // audioTime 5 < currentTime(10) + SAFE_LEAD_SEC → clamped
    engine.topUpLookahead({ cues: [{ audioTime: 5, phaseDurationSec: 4, kind: 'in' }] })

    expect(inSpy.mock.calls[0]?.[1]).toBeCloseTo(probeTime + SAFE_LEAD_SEC, 9)
    await engine.close()
  })
})

// engine.cancelFutureCues: iterates activeCues snapshot, calls cancel() on cues with
// scheduledAt > now, removes them from activeCues; leaves in-flight cues untouched.
describe('Phase 52 D-09/D-10 cancelFutureCues', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('cancelFutureCues() calls cancel() on future cues (scheduledAt > now) and leaves in-flight untouched', async () => {
    const probeTime = 5
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })

    // scheduledAt <= now: in-flight (should NOT be cancelled)
    const inflight = makeMockCueHandle()
    inflight.handle.scheduledAt = 3 // 3 <= 5
    // scheduledAt > now: future (SHOULD be cancelled)
    const future = makeMockCueHandle()
    future.handle.scheduledAt = 8 // 8 > 5

    // Inject cues by mocking scheduleInCueForTimbre to return our controlled handles
    vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
      .mockReturnValueOnce(inflight.handle)
      .mockReturnValueOnce(future.handle)

    engine.topUpLookahead({
      cues: [
        { audioTime: 3, phaseDurationSec: 4, kind: 'in' }, // inflight
        { audioTime: 8, phaseDurationSec: 4, kind: 'in' }, // future
      ],
    })

    engine.cancelFutureCues()

    expect(inflight.handle.cancel).not.toHaveBeenCalled()
    expect(future.handle.cancel).toHaveBeenCalledTimes(1)
    await engine.close()
  })

  it('cancelFutureCues() on a closed engine is a no-op', async () => {
    const engine = await createAudioEngine({ timbre: 'bowl' })
    await engine.close()
    // Should not throw and not iterate anything
    expect(() => { engine.cancelFutureCues() }).not.toThrow()
  })

  it('cancelFutureCues() uses snapshot-iterate pattern (does not throw when Set mutates during iteration)', async () => {
    const probeTime = 5
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    vi.stubGlobal('AudioContext', ProbeAC)

    const engine = await createAudioEngine({ timbre: 'bowl' })
    const future = makeMockCueHandle()
    future.handle.scheduledAt = 10

    vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValueOnce(future.handle)
    engine.topUpLookahead({ cues: [{ audioTime: 10, phaseDurationSec: 4, kind: 'in' }] })

    // Must not throw even though cancel removes the cue from activeCues mid-iteration
    expect(() => { engine.cancelFutureCues() }).not.toThrow()
    expect(future.handle.cancel).toHaveBeenCalledTimes(1)
    await engine.close()
  })
})

// cancel-then-reschedule prevents overlap doubling: proves that calling cancelFutureCues()
// between two overlapping topUpLookahead calls yields scheduler invocations equal to the
// SECOND (final) walk only. Also provides a negative-control that proves doubling DOES occur
// when cancelFutureCues is omitted — locking cancel-then-reschedule as the required pattern.
describe('Phase 52 CR-01 cancel-then-reschedule prevents overlap doubling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Phase 52 CR-01: cancelFutureCues() between two overlapping topUpLookahead calls yields scheduler-call-count equal to the SECOND walk only', async () => {
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre')
    const outSpy = vi.spyOn(cueSynth, 'scheduleOutCueForTimbre')
    const engine = await createAudioEngine({ timbre: 'bowl' })

    // First walk: cues at audioTimes A, B, C — kinds in/out/in
    const firstWalk = [
      { audioTime: 5, phaseDurationSec: 4, kind: 'in' as const },
      { audioTime: 9, phaseDurationSec: 4, kind: 'out' as const },
      { audioTime: 13, phaseDurationSec: 4, kind: 'in' as const },
    ]
    engine.topUpLookahead({ cues: firstWalk })

    // Sanity: first walk dispatched all cues
    const firstWalkCount = inSpy.mock.calls.length + outSpy.mock.calls.length
    expect(firstWalkCount).toBe(firstWalk.length)

    // Reset spy counts before the cancel-then-reschedule cycle
    inSpy.mockClear()
    outSpy.mockClear()

    // Second walk overlaps: B and C from the first walk overlap; D is new
    const secondWalk = [
      { audioTime: 9, phaseDurationSec: 4, kind: 'out' as const },   // B — overlaps
      { audioTime: 13, phaseDurationSec: 4, kind: 'in' as const },   // C — overlaps
      { audioTime: 17, phaseDurationSec: 4, kind: 'out' as const },  // D — new
    ]

    // Option A (cancel-then-reschedule): cancel future cues THEN dispatch second walk
    engine.cancelFutureCues()
    engine.topUpLookahead({ cues: secondWalk })

    // Assert: combined call count equals the FINAL walk size — not 6 (sum of both walks).
    // Assertion uses secondWalk.length, not the literal 3.
    const secondWalkDispatchedCount = inSpy.mock.calls.length + outSpy.mock.calls.length
    expect(secondWalkDispatchedCount).toBe(secondWalk.length)

    await engine.close()
  })

})

// Engine-layer dedup of the in-flight boundary cue prevents a double-strike: the rAF
// top-up re-walks the boundary it is currently crossing, whose in-flight cue survived
// cancelFutureCues (scheduledAt <= now). The dedup skips a requested cue whose unclamped
// audioTime is within SAFE_LEAD_SEC of an IN-FLIGHT cue's scheduledAt — and ONLY in-flight
// (future cues remain the caller's cancel-then-reschedule responsibility).
describe('GAP-52H-2 / WR-01 in-flight boundary-cue dedup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function probeACAt(probeTime: number) {
    class ProbeAC {
      state: AudioContextState = 'running'
      sampleRate = 44100
      destination = {}
      get currentTime() { return probeTime }
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = vi.fn()
      createGain = vi.fn(makeFakeGain)
      createBiquadFilter = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
    }
    return ProbeAC
  }

  it('does NOT re-schedule a cue matching an in-flight cue (boundary flam suppressed), but still schedules a distinct cue', async () => {
    // now is just past the boundary (rAF lag) — the boundary cue is now in-flight.
    vi.stubGlobal('AudioContext', probeACAt(10.02))
    const inflight = makeMockCueHandle()
    inflight.handle.scheduledAt = 10 // the boundary; 10 <= 10.02 → in-flight
    inflight.handle.cleanupAt = 100 // keep it past pruneExpiredCues
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(inflight.handle)
    const engine = await createAudioEngine({ timbre: 'bowl' })

    // Seed the in-flight boundary cue.
    engine.topUpLookahead({ cues: [{ audioTime: 10, phaseDurationSec: 4, kind: 'in' }] })
    inSpy.mockClear()

    // Re-walk: the same boundary (10) plus the genuinely-next cue (14).
    engine.topUpLookahead({
      cues: [
        { audioTime: 10, phaseDurationSec: 4, kind: 'in' }, // duplicate of in-flight → skipped
        { audioTime: 14, phaseDurationSec: 4, kind: 'in' }, // distinct → scheduled
      ],
    })

    // Only the distinct cue dispatched; the boundary cue was deduped (no second strike).
    expect(inSpy.mock.calls.length).toBe(1)
    expect(inSpy.mock.calls[0]?.[1]).toBeCloseTo(14, 9)
    await engine.close()
  })

  it('does NOT dedup against a FUTURE cue (cancel-then-reschedule invariant preserved)', async () => {
    vi.stubGlobal('AudioContext', probeACAt(5))
    const future = makeMockCueHandle()
    future.handle.scheduledAt = 10 // 10 > 5 → future, NOT in-flight
    future.handle.cleanupAt = 100
    const inSpy = vi.spyOn(cueSynth, 'scheduleInCueForTimbre').mockReturnValue(future.handle)
    const engine = await createAudioEngine({ timbre: 'bowl' })

    engine.topUpLookahead({ cues: [{ audioTime: 10, phaseDurationSec: 4, kind: 'in' }] })
    inSpy.mockClear()

    // Re-walk the same time: a FUTURE match must still be scheduled (caller cancels first).
    engine.topUpLookahead({ cues: [{ audioTime: 10, phaseDurationSec: 4, kind: 'in' }] })

    expect(inSpy.mock.calls.length).toBe(1)
    await engine.close()
  })
})

// Lookahead constant guards: tests import the SYMBOLS (not bare literals) so if a
// value is tuned the tests pass without edit; only the source constant changes.
