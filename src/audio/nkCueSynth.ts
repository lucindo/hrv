// Pure Web Audio synthesis builders for Navi Kriya cues. Zero React imports.
//
// All four cue functions read TIMBRE_PRESETS[timbre] and route through the
// user's chosen timbre (Bowl / Bell / Sine / Flute).
//
// Front/Back markers REUSE the HRV breath cues — Front plays the inhale ('in')
// cue, Back the exhale ('out') cue, through the user's chosen timbre. The same
// sound the user already knows from HRV keeps the two practices congruent.
// Per-OM tick = soft, short, barely-there tone (quiet + short duration).
// End chord = resolved low three-note chord with a strike-free pad envelope —
// fades in, holds, fades out (~5 s).
//
// Every node disconnects on its 'ended' event ({ once: true }) — no leaked
// nodes over a long session (375+ ticks). Same discipline as cueSynth.ts.

import { TIMBRE_PRESETS, type TimbrePreset } from './timbres'
import type { TimbreId } from '../domain/settings'
import { scheduleInCueForTimbre, scheduleOutCueForTimbre, type CueHandle } from './cueSynth'
import { CLEANUP_PADDING_SEC, NEAR_SILENCE, STRIKE_RAMP_OFFSET } from './audioConstants'

// --- Timing constants ---

// --- NK-specific cue constants ---

// Front/Back markers reuse the HRV breath cues — no NK-specific marker constants needed.
// Per-OM tick: soft and short
const NK_TICK_DURATION_SEC = 0.12
const NK_TICK_PEAK_GAIN = 0.13 // J16: bumped from 0.08 — still peripheral, slightly more audible per operator UAT
const NK_TICK_DECAY_TAU = 0.05
// Final-OM tick: the per-OM tick pitched a perfect fifth above the fundamental
// (A4 440 → E5 660). Sounds only on the LAST OM of a count so the yogi can
// anticipate the phase switch. A ratio (not a hard 660) so it tracks any future
// per-timbre fundamental. Reuses the tick's duration/gain/decay — same soft
// character, pitch only.
const NK_FINAL_TICK_PITCH_RATIO = 1.5
// Countdown beep: the 3-2-1 lead-in tick, shared by the HRV and Navi countdowns.
// A crisper, higher, snappier beep that reads as more alerting without being louder.
// Kept on its own constants + function so the countdown beep and the per-OM tick
// stay independent — they are not semantically related.
const COUNTDOWN_TICK_DURATION_SEC = 0.1
const COUNTDOWN_TICK_PEAK_GAIN = 0.12
const COUNTDOWN_TICK_DECAY_TAU = 0.04
// Pitch sits a perfect fifth above the timbre fundamental (preset.fundamentalHzIn
// is 440 Hz across all timbres → 660 Hz). Expressed as a ratio so it tracks any
// future per-timbre fundamental rather than hard-coding 660.
const COUNTDOWN_TICK_PITCH_RATIO = 1.5
// End chord: three tones forming a resolved low chord. Shared practice-ending
// sound — both the Navi Kriya completion and the HRV session completion play
// scheduleEndChord, so a change lands in both practices at once.
// Strike-free pad envelope: fade in over END_CHORD_ATTACK_SEC, hold, then a
// linear fade out over END_CHORD_RELEASE_SEC, ~5 s total.
const END_CHORD_DURATION_SEC = 5.0
const END_CHORD_PEAK_GAIN = 0.11
const END_CHORD_ATTACK_SEC = 0.9 // gain ramps 0 → peak over this (the fade-in)
const END_CHORD_RELEASE_SEC = 1.4 // gain ramps peak → 0 over the last of the chord (the fade-out)
// Low chord pitch ratios relative to preset fundamentalHzOut (the lower pitch):
//   root (×1.0), major third (×1.25), perfect fifth (×1.5) — C major chord shape
const END_CHORD_RATIOS = [1.0, 1.25, 1.5] as const

// Total ring-out span of the end chord, from strike to GC-able: the chord
// duration plus the node-cleanup padding (it equals `cleanupAt - scheduledAt`
// of the handle scheduleEndChord returns). Exported so a caller that owns its
// own AudioContext — the Navi Kriya path in App.tsx — can defer teardown until
// the chord finishes, instead of hard-coding a duration that silently drifts
// when the chord is retuned. The HRV path reads cue.cleanupAt off the engine
// and needs no constant.
export const END_CHORD_RINGOUT_SEC = END_CHORD_DURATION_SEC + CLEANUP_PADDING_SEC

// ---

/**
 * Pad envelope spec — passed to buildNKToneNodes in place of a decay τ to get
 * a strike-free fade-in / hold / fade-out shape instead of a percussive strike.
 * Used by the Spike 005 "Warm pad fade" end chord.
 */
interface PadEnvelope {
  attackSec: number // gain ramps 0 → peak over this, starting at `when`
  releaseSec: number // gain ramps peak → 0 over the last releaseSec of the tone
}

/**
 * Private helper: build a single oscillator → partialGain → filter → envelope chain.
 * Schedules the tone at `when` for `durationSec`, connects to `destination`, and
 * returns the constructed nodes for the caller to attach cleanup listeners.
 * Caller is responsible for registering 'ended' listeners.
 *
 * `envelopeSpec` selects the gain shape:
 *   - a `number` → strike: instant attack to peak, exponential decay (τ = the number).
 *   - a `PadEnvelope` → pad: linear fade in, hold, linear fade out. No strike.
 * Strike is the original behaviour — the tick/countdown callers pass a number and
 * are byte-identical to before this overload existed.
 */
function buildNKToneNodes(
  audioCtx: AudioContext,
  freqHz: number,
  durationSec: number,
  when: number,
  destination: AudioNode,
  preset: TimbrePreset,
  peakGain: number,
  envelopeSpec: number | PadEnvelope,
): { osc: OscillatorNode; partialGain: GainNode; filter: BiquadFilterNode; envelope: GainNode; stopAt: number; cleanupAt: number } {
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = preset.filterFreqHz
  filter.Q.value = preset.filterQ

  const envelope = audioCtx.createGain()
  if (typeof envelopeSpec === 'number') {
    // Strike: instant attack, exponential decay (verbatim pre-Spike-005 behaviour).
    envelope.gain.setValueAtTime(peakGain, when)
    envelope.gain.setTargetAtTime(NEAR_SILENCE, when + STRIKE_RAMP_OFFSET, envelopeSpec)
  } else {
    // Pad: linear fade in → hold → linear fade out (Spike 005 "Warm pad fade").
    // For short tones where attack + release ≥ durationSec there is no hold
    // window: cap the ramp peak at the fade-out start so the up-ramp and
    // down-ramp meet at a single time. Also guard against attack alone
    // exceeding durationSec (the up-ramp would otherwise run past osc.stop).
    // Skipping the redundant setValueAtTime(peak, releaseStart) avoids
    // same-instant automation events whose ordering is implementation-defined
    // across Chrome / Safari.
    const stopAt = when + durationSec
    const releaseStart = Math.max(when, stopAt - envelopeSpec.releaseSec)
    const attackEnd = Math.min(when + envelopeSpec.attackSec, releaseStart, stopAt)
    envelope.gain.setValueAtTime(NEAR_SILENCE, when)
    envelope.gain.linearRampToValueAtTime(peakGain, attackEnd)
    if (releaseStart > attackEnd) {
      envelope.gain.setValueAtTime(peakGain, releaseStart)
    }
    envelope.gain.linearRampToValueAtTime(NEAR_SILENCE, stopAt)
  }

  const stopAt = when + durationSec
  const cleanupAt = when + durationSec + CLEANUP_PADDING_SEC

  const osc = audioCtx.createOscillator()
  osc.type = preset.oscillatorType
  osc.frequency.value = freqHz

  // partialGain: unity — NK tones are single-partial; peakGain drives loudness
  const partialGain = audioCtx.createGain()
  partialGain.gain.value = 1.0

  osc.connect(partialGain)
  partialGain.connect(filter)
  filter.connect(envelope)
  envelope.connect(destination)

  osc.start(when)
  osc.stop(stopAt)

  return { osc, partialGain, filter, envelope, stopAt, cleanupAt }
}

// Disconnect a built tone's four nodes. Wrapped per-node so a node already
// disconnected (by a prior 'ended' or cancel()) doesn't abort the rest — the
// 'ended' listener and cancel() may both fire and both must be idempotent.
function disconnectToneNodes(
  t: { osc: OscillatorNode; partialGain: GainNode; filter: BiquadFilterNode; envelope: GainNode },
): void {
  try { t.osc.disconnect() } catch { /* silent */ }
  try { t.partialGain.disconnect() } catch { /* silent */ }
  try { t.filter.disconnect() } catch { /* silent */ }
  try { t.envelope.disconnect() } catch { /* silent */ }
}

// --- Exported NK cue builders ---

/**
 * Front marker — the HRV inhale ('in') cue, played through the user's chosen
 * timbre. Reusing the breath cue keeps Navi Kriya congruent with HRV: the same
 * sound the user already reads as the start of an inhale. No phaseDurationSec —
 * the marker is a one-shot struck cue that decays naturally, not a sustained
 * phase cue.
 */
export function scheduleNKFrontMarker(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  return scheduleInCueForTimbre(audioCtx, when, destination, timbre)
}

/**
 * Back marker — the HRV exhale ('out') cue, played through the user's chosen
 * timbre. The exhale counterpart to scheduleNKFrontMarker; see that function's
 * note on HRV congruence and the one-shot (no phaseDurationSec) decay.
 */
export function scheduleNKBackMarker(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  return scheduleOutCueForTimbre(audioCtx, when, destination, timbre)
}

/**
 * Soft, barely-there short tone — anchors the OM rhythm in peripheral hearing.
 * Short duration (~0.12 s) and low peak gain so it sits quietly under the chant.
 */
export function scheduleNKTick(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  const preset = TIMBRE_PRESETS[timbre]
  const t = buildNKToneNodes(
    audioCtx, preset.fundamentalHzIn, NK_TICK_DURATION_SEC, when,
    destination, preset, NK_TICK_PEAK_GAIN, NK_TICK_DECAY_TAU,
  )
  // Disconnect tick nodes on 'ended'
  t.osc.addEventListener('ended', () => { disconnectToneNodes(t) }, { once: true })

  // cancel() — stop oscillator + disconnect chain. Same try/catch posture as the
  // 'ended' listener above. The 'ended' listener and cancel() may both fire;
  // both must be safe (idempotent).
  const cancel = (): void => {
    t.envelope.gain.cancelScheduledValues(audioCtx.currentTime)
    try { t.osc.stop(audioCtx.currentTime) } catch { /* silent — osc may already be stopped */ }
    disconnectToneNodes(t)
  }

  return { envelope: t.envelope, scheduledAt: when, cleanupAt: t.cleanupAt, cancel }
}

/**
 * Final-OM tick — the per-OM tick pitched a perfect fifth above the fundamental
 * (see NK_FINAL_TICK_PITCH_RATIO). Same soft, short character as scheduleNKTick;
 * only the pitch differs, marking the last OM of a count so the practitioner can
 * anticipate the phase switch. Reuses the tick's duration/gain/decay constants.
 */
export function scheduleNKFinalTick(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  const preset = TIMBRE_PRESETS[timbre]
  const t = buildNKToneNodes(
    audioCtx, preset.fundamentalHzIn * NK_FINAL_TICK_PITCH_RATIO, NK_TICK_DURATION_SEC, when,
    destination, preset, NK_TICK_PEAK_GAIN, NK_TICK_DECAY_TAU,
  )
  // Disconnect the tick nodes on 'ended' (mirrors scheduleNKTick).
  t.osc.addEventListener('ended', () => { disconnectToneNodes(t) }, { once: true })

  // cancel() — stop oscillator + disconnect chain. Same idempotent posture as
  // scheduleNKTick; the 'ended' listener and cancel() may both fire.
  const cancel = (): void => {
    t.envelope.gain.cancelScheduledValues(audioCtx.currentTime)
    try { t.osc.stop(audioCtx.currentTime) } catch { /* silent — osc may already be stopped */ }
    disconnectToneNodes(t)
  }

  return { envelope: t.envelope, scheduledAt: when, cleanupAt: t.cleanupAt, cancel }
}

/**
 * Countdown beep — the 3-2-1 lead-in tick shared by the HRV and Navi countdowns.
 * A perfect fifth above the timbre fundamental (~660 Hz), shorter and snappier
 * than the per-OM tick. A SEPARATE function on its own constants — the countdown
 * beep and the per-OM tick are semantically distinct, so either can change without
 * affecting the other.
 */
export function scheduleCountdownTick(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  const preset = TIMBRE_PRESETS[timbre]
  const t = buildNKToneNodes(
    audioCtx, preset.fundamentalHzIn * COUNTDOWN_TICK_PITCH_RATIO, COUNTDOWN_TICK_DURATION_SEC, when,
    destination, preset, COUNTDOWN_TICK_PEAK_GAIN, COUNTDOWN_TICK_DECAY_TAU,
  )
  // Disconnect the tick nodes on 'ended' (mirrors scheduleNKTick).
  t.osc.addEventListener('ended', () => { disconnectToneNodes(t) }, { once: true })

  // cancel() — stop oscillator + disconnect chain. Same try/catch posture as the
  // 'ended' listener above. The 'ended' listener and cancel() may both fire;
  // both must be safe (idempotent).
  const cancel = (): void => {
    t.envelope.gain.cancelScheduledValues(audioCtx.currentTime)
    try { t.osc.stop(audioCtx.currentTime) } catch { /* silent — osc may already be stopped */ }
    disconnectToneNodes(t)
  }

  return { envelope: t.envelope, scheduledAt: when, cleanupAt: t.cleanupAt, cancel }
}

/**
 * Resolved low multi-note chord — a clear, restful session/practice-ending
 * sound. SHARED: both the Navi Kriya completion and the HRV session completion
 * play this, so the ending sound stays identical across practices and a change
 * applies to both.
 * Three tones (root, major-third, fifth) based on preset fundamentalHzOut,
 * scheduled simultaneously at `when`. Spike 005 ("Warm pad fade") gives it a
 * strike-free pad envelope — fades in, holds, fades out over ~5 s. Returns the
 * handle of the longest-lived tone.
 */
export function scheduleEndChord(
  audioCtx: AudioContext,
  when: number,
  destination: AudioNode,
  timbre: TimbreId,
): CueHandle {
  const preset = TIMBRE_PRESETS[timbre]
  // Route every chord voice through a single master GainNode so the returned
  // CueHandle.envelope controls all three voices. Without this, a mid-chord
  // mute (audioEngine.setMuted(true) → applyMuteFadeOut on cue.envelope) would
  // only fade the last voice's envelope and the other two would ring out at
  // peak through their independent fade-out ramps.
  const masterEnvelope = audioCtx.createGain()
  masterEnvelope.gain.value = 1.0
  masterEnvelope.connect(destination)

  let lastCleanupAt = 0
  let lastOsc: OscillatorNode | null = null

  // Collect voice nodes for cancel() closure.
  const voiceOscs: OscillatorNode[] = []
  const voicePartialGains: GainNode[] = []
  const voiceFilters: BiquadFilterNode[] = []
  const voiceEnvelopes: GainNode[] = []

  for (const ratio of END_CHORD_RATIOS) {
    const t = buildNKToneNodes(
      audioCtx, preset.fundamentalHzOut * ratio, END_CHORD_DURATION_SEC, when,
      masterEnvelope, preset, END_CHORD_PEAK_GAIN,
      { attackSec: END_CHORD_ATTACK_SEC, releaseSec: END_CHORD_RELEASE_SEC },
    )
    // Disconnect each chord tone's nodes on 'ended'
    t.osc.addEventListener('ended', () => { disconnectToneNodes(t) }, { once: true })
    voiceOscs.push(t.osc)
    voicePartialGains.push(t.partialGain)
    voiceFilters.push(t.filter)
    voiceEnvelopes.push(t.envelope)
    lastCleanupAt = t.cleanupAt
    lastOsc = t.osc
  }

  // All three voices share the same stopAt (when + END_CHORD_DURATION_SEC), so
  // any voice's 'ended' is safe for tearing down the shared master bus.
  if (lastOsc !== null) {
    lastOsc.addEventListener('ended', () => {
      try { masterEnvelope.disconnect() } catch { /* silent */ }
    }, { once: true })
  }

  // cancel() — stop all voice oscillators + disconnect all nodes.
  // cancelScheduledValues on the master envelope discards pending automation.
  // Same try/catch posture as the 'ended' listeners above. The 'ended' listeners
  // and cancel() may both fire on the same voice; both must be safe (idempotent).
  const cancel = (): void => {
    masterEnvelope.gain.cancelScheduledValues(audioCtx.currentTime)
    for (const osc of voiceOscs) {
      try { osc.stop(audioCtx.currentTime) } catch { /* silent — osc may already be stopped */ }
      try { osc.disconnect() } catch { /* silent — node may already be disconnected */ }
    }
    for (const pg of voicePartialGains) {
      try { pg.disconnect() } catch { /* silent — node may already be disconnected */ }
    }
    for (const f of voiceFilters) {
      try { f.disconnect() } catch { /* silent — node may already be disconnected */ }
    }
    for (const ve of voiceEnvelopes) {
      try { ve.disconnect() } catch { /* silent — node may already be disconnected */ }
    }
    try { masterEnvelope.disconnect() } catch { /* silent — node may already be disconnected */ }
  }

  return { envelope: masterEnvelope, scheduledAt: when, cleanupAt: lastCleanupAt, cancel }
}
