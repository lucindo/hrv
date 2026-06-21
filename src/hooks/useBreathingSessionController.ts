import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  LOOKAHEAD_MIN_CUES,
  LOOKAHEAD_WINDOW_SEC,
} from '../audio/audioEngine'
import { createBreathingPlan } from '../domain/breathingPlan'
import { resolveRoundsCueAction, resolveTargetSec, walkFutureCues } from '../domain/sessionAudio'
import type { BreathingSessionPhase, LeadInDigit } from '../domain/sessionLifecycle'
import { getSessionFrame, type SessionFrame } from '../domain/sessionMath'
import type { CueStyleId, SessionSettings, StretchSettings } from '../domain/settings'
import { buildStretchSegments, getStretchFrame } from '../domain/stretchRamp'
import {
  loadMute,
  loadPrefs,
  recordResonantSession,
  recordStretchSession,
  saveMute,
  saveResonantSettings,
  type PracticeId,
} from '../storage'
import { useAudioCues, type AudioStatusFlag } from './useAudioCues'
import { clearScheduledTimeouts, scheduleLeadInTimeouts } from './leadInCountdown'
import { useSessionEngine, type SessionEngine } from './useSessionEngine'
import type { UseWakeLock } from './useWakeLock'

export type { BreathingSessionPhase, LeadInDigit } from '../domain/sessionLifecycle'

export interface BreathingAudioControls {
  muted: boolean
  audioAvailable: boolean
  audioStatus: AudioStatusFlag
  onMuteOrResumeClick(this: void): Promise<void>
}

export interface BreathingSessionController {
  session: SessionEngine
  phase: BreathingSessionPhase
  inSessionView: boolean
  leadInDigit: LeadInDigit | null
  leadInPlaceholderFrame: SessionFrame | null
  sessionCue: CueStyleId | null
  endDialogOpen: boolean
  audio: BreathingAudioControls
  setSelectedSettings(this: void, next: SessionSettings): void
  startOrCancel(this: void): Promise<void>
  requestEnd(this: void): void
  confirmEnd(this: void): void
  cancelEnd(this: void): void
  resetSession(this: void): void
}

export interface UseBreathingSessionControllerArgs {
  initialSettings: SessionSettings
  activePractice: PracticeId
  stretchSettings: StretchSettings
  liveCue: CueStyleId
  wakeLock: UseWakeLock
  /** Optional bypass-silent-mode flag threaded from featureFlags.bypassSilentMode.
   *  Undefined passes through to useAudioCues.start → audioEngine where it coerces
   *  to the backward-compatible default behavior. */
  bypassSilentMode?: boolean
}

export function useBreathingSessionController({
  initialSettings,
  activePractice,
  stretchSettings,
  liveCue,
  wakeLock,
  bypassSilentMode,
}: UseBreathingSessionControllerArgs): BreathingSessionController {
  const initialMute = useMemo<boolean>(() => loadMute(), [])
  const activeStretchSettings = activePractice === 'stretch' ? stretchSettings : null

  const [phase, setPhase] = useState<BreathingSessionPhase>('idle')
  const [leadInDigit, setLeadInDigit] = useState<LeadInDigit | null>(null)
  const [sessionCue, setSessionCue] = useState<CueStyleId | null>(null)
  const [endDialogOpen, setEndDialogOpen] = useState<boolean>(false)

  const audioAnchorRef = useRef<number | null>(null)
  const planRef = useRef<ReturnType<typeof createBreathingPlan> | null>(null)
  const startGenerationRef = useRef<number>(0)
  const leadInTimeoutsRef = useRef<number[]>([])
  const recordedSessionKeyRef = useRef<string | null>(null)
  const sessionCueRef = useRef<CueStyleId | null>(null)
  const sessionFrameRef = useRef<SessionFrame | null>(null)

  const onAudioReanchorRequired = useCallback((newAudioAnchor: number): void => {
    // liveFrame.elapsedSec is seconds-shaped — subtract it directly from the new
    // audio anchor (no `/1000`).
    const elapsedSec = sessionFrameRef.current?.elapsedSec ?? 0
    audioAnchorRef.current = newAudioAnchor - elapsedSec
  }, [])

  // Bridge from useAudioCues.onSessionClockReanchored to
  // useSessionEngine.reanchorSessionClock. Defined via a stable callback that reads
  // through sessionReanchorRef so the callback identity is fixed for useAudioCues's
  // dep tracking, even though `session` itself is created on the line below.
  const sessionReanchorRef = useRef<((newClockNow: number) => void) | null>(null)
  const onSessionClockReanchored = useCallback((newClockNow: number): void => {
    sessionReanchorRef.current?.(newClockNow)
  }, [])

  // Audio precedes session (hook ordering — audio.clock is the SessionClock seam
  // useSessionEngine reads from). The audio-backed proxy exists from first render
  // (initial source is a wall clock) and swaps to the AC clock inside
  // useAudioCues.start().
  const audio = useAudioCues(initialMute, onAudioReanchorRequired, onSessionClockReanchored)
  const session = useSessionEngine(initialSettings, activeStretchSettings, audio.clock)
  const { state } = session

  useEffect(() => {
    sessionFrameRef.current = session.liveFrame
  }, [session.liveFrame])

  useEffect(() => {
    sessionReanchorRef.current = session.reanchorSessionClock
  }, [session.reanchorSessionClock])

  const audioStop = audio.stop
  const audioStart = audio.start
  const audioTopUpLookahead = audio.topUpLookahead
  const audioCancelFutureCues = audio.cancelFutureCues
  const audioPlayEndChord = audio.playEndChord
  const audioScheduleLeadInTicks = audio.scheduleLeadInTicks
  const audioStatus = audio.audioStatus
  const audioResume = audio.resume
  // audioMuted drives the mute/resume toggle (onMuteOrResumeClick). It does NOT
  // gate the top-up effect — cues schedule while muted and route silently through
  // the engine's master gain.
  const audioMuted = audio.muted
  const audioSetMuted = audio.setMuted
  const wakeLockRequest = wakeLock.request
  const wakeLockRelease = wakeLock.release
  const sessionStart = session.start
  const sessionEnd = session.end
  const sessionSetSelectedSettings = session.setSelectedSettings

  const inSessionView = phase !== 'idle'

  const leadInPlaceholderFrame = useMemo((): SessionFrame | null => {
    if (phase !== 'lead-in') return null

    if (activePractice === 'stretch') {
      return getStretchFrame(buildStretchSegments(stretchSettings), 0)
    }

    return getSessionFrame(createBreathingPlan(state.selectedSettings), 0)
  }, [phase, activePractice, stretchSettings, state.selectedSettings])

  const clearLeadInTimeouts = useCallback((): void => {
    clearScheduledTimeouts(leadInTimeoutsRef.current)
    leadInTimeoutsRef.current = []
  }, [])

  const clearCapturedSession = useCallback((): void => {
    audioAnchorRef.current = null
    planRef.current = null
    sessionCueRef.current = null
    setSessionCue(null)
  }, [])

  const setSelectedSettings = useCallback((next: SessionSettings): void => {
    sessionSetSelectedSettings(next)
    saveResonantSettings(next)
  }, [sessionSetSelectedSettings])

  const persistedSetMuted = useCallback((next: boolean): void => {
    audioSetMuted(next)
    saveMute(next)
  }, [audioSetMuted])

  const onMuteOrResumeClick = useCallback(async (): Promise<void> => {
    if (audioStatus === 'needs-resume') {
      await audioResume()
    }
    persistedSetMuted(!audioMuted)
  }, [audioStatus, audioResume, audioMuted, persistedSetMuted])

  useEffect(() => {
    if (state.status !== 'running' && endDialogOpen) {
      // Reason: dialog visibility mirrors the session status owned by useSessionEngine.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEndDialogOpen(false)
    }
  }, [state.status, endDialogOpen])

  const startOrCancel = useCallback(async (): Promise<void> => {
    if (phase === 'lead-in') {
      startGenerationRef.current += 1
      clearLeadInTimeouts()
      setLeadInDigit(null)
      setPhase('idle')
      clearCapturedSession()
      await Promise.allSettled([audioStop(), wakeLockRelease()])
      return
    }

    if (phase !== 'idle') return

    const generation = ++startGenerationRef.current
    sessionCueRef.current = liveCue
    setSessionCue(liveCue)
    setPhase('lead-in')
    setLeadInDigit(3)
    void wakeLockRequest()

    const plan = createBreathingPlan(state.selectedSettings)
    planRef.current = plan
    const capturedTimbre = loadPrefs().timbre
    // Pass bypassSilentMode as the 3rd arg to useAudioCues.start. It flows into
    // createAudioEngine via bypassSilentModeRef.
    const firstInAudioTime = await audioStart(plan, capturedTimbre, bypassSilentMode)

    if (generation !== startGenerationRef.current) {
      await audioStop()
      return
    }

    leadInTimeoutsRef.current = scheduleLeadInTimeouts({
      onDigit: setLeadInDigit,
      onComplete: () => {
        setLeadInDigit(null)
        audioAnchorRef.current = firstInAudioTime
        setPhase('running')
        sessionStart()
      },
    })
  }, [
    phase,
    liveCue,
    state.selectedSettings,
    audioStart,
    audioStop,
    wakeLockRequest,
    wakeLockRelease,
    sessionStart,
    clearLeadInTimeouts,
    clearCapturedSession,
    bypassSilentMode,
  ])

  const runningNeedsConfirmation =
    state.status === 'running' &&
    (state.lockedSettings.durationMinutes !== 'open-ended' || state.stretchSegments !== null)

  const requestEnd = useCallback((): void => {
    if (runningNeedsConfirmation) {
      setEndDialogOpen(true)
      return
    }
    sessionEnd()
    void audioStop()
  }, [runningNeedsConfirmation, sessionEnd, audioStop])

  const confirmEnd = useCallback((): void => {
    setEndDialogOpen(false)
    sessionEnd()
    void audioStop()
  }, [sessionEnd, audioStop])

  const cancelEnd = useCallback((): void => {
    setEndDialogOpen(false)
  }, [])

  const resetSession = useCallback((): void => {
    sessionEnd()
  }, [sessionEnd])

  // CompleteSessionState.completedAtSec is seconds-shaped; storage's
  // recordResonantSession / recordStretchSession accept ms-shaped values. The
  // boundary conversion (× 1000) lives here, at the consumer-to-storage edge.
  // This is the ONLY ms-shaped value emitted from this hook; everywhere else in
  // the running-session chain is seconds-shaped end-to-end.
  const completedAtSec = state.status === 'complete' ? state.completedAtSec : null
  // Rounds completed by a finished rounds practice — narrowed here (the union access
  // is invalid on Idle) so the record effect reads a primitive. null for non-rounds
  // and early-ended practices → they count as 1 round.
  const completedRoundsTotal =
    state.status === 'complete' && state.roundsTimeline !== null
      ? state.roundsTimeline.roundsTotal
      : null
  const runningSnapshotRefStable = session.runningSnapshotRef
  useEffect(() => {
    if (state.status === 'running') return

    if (state.status === 'complete') {
      audioPlayEndChord()
    }

    void audioStop()
    void wakeLockRelease()
    // Reason: phase mirrors the session status owned by useSessionEngine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('idle')
    clearLeadInTimeouts()
    clearCapturedSession()

    const snap = runningSnapshotRefStable.current
    if (snap !== null && recordedSessionKeyRef.current !== snap.key) {
      const isComplete = state.status === 'complete'
      const elapsedSec =
        isComplete && completedAtSec !== null
          ? completedAtSec - snap.startedAtSec
          : snap.lastElapsedSec
      // Storage layer expects ms-shaped values. Convert at this boundary only —
      // the in-memory chain stays seconds-shaped.
      const elapsedMs = elapsedSec * 1000

      if (activePractice === 'stretch') {
        recordStretchSession(elapsedMs, isComplete)
      } else {
        // A completed rounds practice counts all its rounds; a single block or an
        // early-ended practice counts 1.
        recordResonantSession(elapsedMs, isComplete, {}, completedRoundsTotal ?? 1)
      }
      recordedSessionKeyRef.current = snap.key
    }
  }, [
    state.status,
    completedAtSec,
    completedRoundsTotal,
    runningSnapshotRefStable,
    activePractice,
    audioStop,
    audioPlayEndChord,
    wakeLockRelease,
    clearLeadInTimeouts,
    clearCapturedSession,
  ])

  // Top-up trigger: on every session frame change (rAF tick), compute the next N
  // cue audioTimes from the anchor via walkFutureCues and dispatch via
  // engine.topUpLookahead. Load-bearing gates preserved:
  //   1. phase !== 'running' early return (guards lead-in + post-end)
  //   2. audioAnchor === null gate (anchor is null until lead-in onComplete)
  //   3. plan === null gate
  // Session stays 'running' through hidden windows — queued cues self-terminate
  // via cueSynth envelope.
  //
  // stretchSegmentsForTopUp: derive a dep-array-safe value by narrowing outside the
  // effect. IdleSessionState has no stretchSegments property; accessing it directly in
  // the dep array causes a TS2339 error with tsc -b. The local const is typed as
  // StretchSegment[] | null | undefined and is stable-referentially when idle (undefined).
  const stretchSegmentsForTopUp =
    state.status === 'running' || state.status === 'complete'
      ? state.stretchSegments
      : undefined
  const roundsTimelineForTopUp =
    state.status === 'running' || state.status === 'complete'
      ? state.roundsTimeline
      : undefined
  useEffect(() => {
    if (phase !== 'running') return

    // No muted gate. The lookahead queue keeps refilling while muted so cues play
    // silently through the master gain (gain=0); unmute is then instant with no
    // boundary wait. Mute is purely a master-gain ramp in the engine.

    const frame = session.currentFrame
    if (frame === null) return

    const audioAnchor = audioAnchorRef.current
    const plan = planRef.current
    if (audioAnchor === null || plan === null) return

    // Rounds: ONE continuous session with rest + lead-in gaps. Top up cues only for
    // the current work block (trimmed at its end so the lookahead floor can't leak a
    // cue into the rest gap); go silent during rest/lead-in; ring the end chord at
    // each work→rest round boundary. The final round's end chord fires on 'complete'
    // (the leave-running effect above). resolveRoundsCueAction is pure + tested.
    if (roundsTimelineForTopUp != null) {
      const action = resolveRoundsCueAction({
        timeline: roundsTimelineForTopUp,
        frame,
        audioAnchor,
        plan,
        lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
        minCues: LOOKAHEAD_MIN_CUES,
      })
      audioCancelFutureCues()
      if (action.kind === 'work') {
        audioTopUpLookahead(action.cues)
      } else if (action.kind === 'rest') {
        audioPlayEndChord()
      } else {
        // lead-in: breath cues stay cancelled; schedule the audible 3-2-1 ticks
        // (the visual digit comes from the frame). currentFrame is per-phase-stable,
        // so this fires once on entering the lead-in.
        audioScheduleLeadInTicks(action.ticksStartAudioTime)
      }
      return
    }

    // Session-elapsed relative to anchor for the lookahead window computation
    const elapsedSec = frame.elapsedSec

    // Stretch sessions expose segments via state.stretchSegments.
    // stretchSegmentsForTopUp is derived above from the narrowed state union (safe for TS).
    const segments = stretchSegmentsForTopUp ?? undefined

    // Trim the lookahead at the session's TRUE completion boundary (see
    // resolveTargetSec) so the held-open final cycle's cues play and the boundary
    // cue — where the end chord fires — is dropped by walkFutureCues' >= trim.
    const targetSec = resolveTargetSec(plan, segments)

    const cues = walkFutureCues({
      audioAnchor,
      elapsedSec,
      fromCycleIndex: frame.cycleIndex,
      fromPhase: frame.phase,
      plan,
      segments,
      lookaheadWindowSec: LOOKAHEAD_WINDOW_SEC,
      minCues: LOOKAHEAD_MIN_CUES,
      targetSec,
    })

    // Cancel-then-reschedule: cancelFutureCues cancels all queued cues with
    // scheduledAt > audioNow, preventing duplicate OscillatorNode chains from
    // consecutive overlapping topUpLookahead walks.
    //
    // In-flight cues (scheduledAt <= audioNow) survive cancelFutureCues and
    // continue playing naturally. The new walk may re-generate the same boundary
    // cue if the rAF tick fires 16–50ms after the audio clock crossed the
    // boundary. The callee-side SAFE_LEAD_SEC clamp would schedule the duplicate
    // at audioNow+5ms — a 5ms flam. This is a known, accepted residual artifact
    // of the rAF-based scheduling model. A dispatch-site filter was removed
    // because it incorrectly drops reconstruction-path cues whose audioTime can
    // be legitimately behind audioNow due to anchor math (audioAnchor =
    // newAC-elapsed). After reconstruction, anchor shifts produce different
    // audioTimes so no double-strike occurs; the filter is therefore only needed
    // for the single-tick lag case which produces the minimal 5ms flam.
    audioCancelFutureCues()
    audioTopUpLookahead(cues)
  }, [phase, session.currentFrame, audioTopUpLookahead, audioCancelFutureCues, audioPlayEndChord, audioScheduleLeadInTicks, stretchSegmentsForTopUp, roundsTimelineForTopUp])

  useEffect(() => {
    return () => {
      clearLeadInTimeouts()
    }
  }, [clearLeadInTimeouts])

  return {
    session,
    phase,
    inSessionView,
    leadInDigit,
    leadInPlaceholderFrame,
    sessionCue,
    endDialogOpen,
    audio: {
      muted: audio.muted,
      audioAvailable: audio.audioAvailable,
      audioStatus: audio.audioStatus,
      onMuteOrResumeClick,
    },
    setSelectedSettings,
    startOrCancel,
    requestEnd,
    confirmEnd,
    cancelEnd,
    resetSession,
  }
}
