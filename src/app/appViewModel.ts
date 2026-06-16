import type { LEARN_CONTENT } from '../content/learnContent'
import type { LOCKED_COPY } from '../content/lockedCopy'
import type { UiStrings } from '../content/strings'
import type { AppScreen, ReturningFrom } from './useAppNavigation'
import type { AudioStatusFlag } from '../audio/audioStatus'
import type {
  BreathingSessionPhase,
  CueStyleId,
  LeadInDigit,
  LocaleId,
  NaviKriyaSettings,
  NaviLeadInDigit,
  SessionFrame,
  SessionSettings,
  SessionStatus,
  StretchSettings,
} from '../domain'
import { formatRatio } from '../domain'
import type { FeatureFlags } from '../featureFlags'
import type { PersistedStats, PracticeId } from '../storage'
import type { getPracticeToggleStrings } from './practiceCopy'
import {
  getBreathingPresentation,
  getNaviKriyaPresentation,
  getSessionPrimaryActionLabel,
  type BreathingPresentation,
  type NaviKriyaPresentation,
  type SessionPrimaryAction,
} from './sessionPresentation'

type LearnContent = (typeof LEARN_CONTENT)[keyof typeof LEARN_CONTENT]
type LockedCopy = (typeof LOCKED_COPY)[keyof typeof LOCKED_COPY]

export interface AppInstallViewModel {
  isIOS: boolean
  isStandalone: boolean
  installable: boolean
  onInstall(this: void): Promise<void>
}

export interface AppEndSessionDialogViewModel {
  id: 'breathing' | 'naviKriya'
  open: boolean
  onConfirm(this: void): void
  onCancel(this: void): void
}

export interface AppNavigationViewModel {
  appScreen: AppScreen
  returningFrom: ReturningFrom
  onLearnOpen(this: void): void
  onSettingsOpen(this: void): void
  onAdvancedOpen(this: void): void
  onStatsOpen(this: void): void
  onBackToPractice(this: void): void
  onBackFromAdvanced(this: void): void
  onBackFromStats(this: void): void
}

export interface AppDialogsViewModel {
  endSessionDialogs: readonly AppEndSessionDialogViewModel[]
}

export const AUDIO_RESUME_HINT_ID = 'mute-toggle-resume-hint'

export interface AppAudioToggleViewModel {
  muted: boolean
  audioAvailable: boolean
  needsResume: boolean
  /** Id of the App-level aria-live resume-hint region. Required when
   *  needsResume can become true (breathing audio VM); omitted when
   *  needsResume is structurally false (navi audio VM has no resume flow). */
  resumeHintId?: string
  onMuteToggle(this: void): void
}

export interface AppAudioViewModel extends AppAudioToggleViewModel {
  audioStatus: AudioStatusFlag
}

export interface AppPracticeControlsViewModel {
  primaryLabel: string
  onPrimaryClick(this: void): void
  audio: AppAudioToggleViewModel
}

export type AppPracticeSessionViewModel =
  | {
      kind: 'resonant'
      presentation: BreathingPresentation
    }
  | {
      kind: 'stretch'
      presentation: BreathingPresentation
    }
  | {
      kind: 'naviKriya'
      presentation: NaviKriyaPresentation
    }

export type AppPracticeSettingsViewModel =
  | {
      kind: 'hidden'
    }
  | {
      kind: 'resonant'
      settings: SessionSettings
      isRunning: boolean
      isComplete: boolean
      onChange(this: void, settings: SessionSettings): void
      onExtendDuration(this: void, durationMinutes: number): void
    }
  | {
      kind: 'stretch'
      settings: StretchSettings
      isRunning: boolean
      isComplete: boolean
      onChange(this: void, settings: StretchSettings): void
    }
  | {
      kind: 'naviKriya'
      settings: NaviKriyaSettings
      isComplete: boolean
      onChange(this: void, settings: NaviKriyaSettings): void
    }

// Per-practice stats snapshot held in app state and surfaced on the Stats page.
// Refreshed from disk when the page opens and updated optimistically on reset.
export type PracticeStatsMap = Readonly<Record<PracticeId, PersistedStats>>

export interface AppViewModel {
  activePractice: PracticeId
  locale: LocaleId
  appTitle: string
  controlsDisabled: boolean
  practiceSession: AppPracticeSessionViewModel
  practiceSettings: AppPracticeSettingsViewModel
  audio: AppAudioViewModel
  practiceControls: AppPracticeControlsViewModel
  uiStrings: UiStrings
  learnContent: LearnContent
  lockedCopy: LockedCopy
  practiceToggleStrings: ReturnType<typeof getPracticeToggleStrings>
  featureFlags: FeatureFlags
  install: AppInstallViewModel
  navigation: AppNavigationViewModel
  dialogs: AppDialogsViewModel
  stats: PracticeStatsMap
  onResetPracticeStats(this: void, practice: PracticeId): void
  onSwitchPractice(this: void, next: PracticeId): void
}

export interface CreateInstallViewModelArgs {
  isStandalone: boolean
  isIOS: boolean
  canPromptInstall: boolean
  onInstall(this: void): Promise<void>
}

export function createInstallViewModel({
  isStandalone,
  isIOS,
  canPromptInstall,
  onInstall,
}: CreateInstallViewModelArgs): AppInstallViewModel {
  const installable = isIOS || canPromptInstall

  return {
    isIOS,
    isStandalone,
    installable,
    onInstall,
  }
}

export interface BreathingSessionViewState {
  phase: BreathingSessionPhase
  sessionCue: CueStyleId | null
  leadInDigit: LeadInDigit | null
  leadInPlaceholderFrame: SessionFrame | null
  liveFrame: SessionFrame | null
  status: SessionStatus
  inSessionView: boolean
  // Resonant selected settings — drives the HRV pace caption (X BPM · ratio).
  // Preserved across stretch sessions so the caption stays stable during a stretch run.
  selectedSettings: SessionSettings
}

export interface NaviKriyaSessionViewState {
  sessionActive: boolean
  starting: boolean
  leadInDigit: NaviLeadInDigit | null
  phase: 'idle' | 'front' | 'back' | 'done'
  round: number
  count: number
  running: boolean
  settings: NaviKriyaSettings
  justCompleted: boolean
}

export interface CreatePracticeSessionViewModelArgs {
  activePractice: PracticeId
  breathing: BreathingSessionViewState
  navi: NaviKriyaSessionViewState
  liveCue: CueStyleId
}

export function createPracticeSessionViewModel({
  activePractice,
  breathing,
  navi,
  liveCue,
}: CreatePracticeSessionViewModelArgs): AppPracticeSessionViewModel {
  if (activePractice === 'naviKriya') {
    return {
      kind: 'naviKriya',
      presentation: getNaviKriyaPresentation({
        sessionActive: navi.sessionActive,
        starting: navi.starting,
        leadInDigit: navi.leadInDigit,
        phase: navi.phase,
        round: navi.round,
        count: navi.count,
        running: navi.running,
        settings: navi.settings,
        justCompleted: navi.justCompleted,
        liveCue,
      }),
    }
  }

  // Resonant + stretch both render through BreathingSessionSurface today
  // (stretch frames piggyback on useBreathingSessionController with currentBpm
  // + stage). Keep the kind aligned with PracticeId so a future practice that
  // does NOT share the breathing controller — or a stretch split — surfaces
  // as a missing arm at the type level instead of falling through silently.
  const presentation = getBreathingPresentation({
    phase: breathing.phase,
    sessionCue: breathing.sessionCue,
    liveCue,
    leadInDigit: breathing.leadInDigit,
    leadInPlaceholderFrame: breathing.leadInPlaceholderFrame,
    liveFrame: breathing.liveFrame,
    status: breathing.status,
    inSessionView: breathing.inSessionView,
    bpm: breathing.selectedSettings.bpm,
    ratio: formatRatio(breathing.selectedSettings.inhaleShare),
  })

  if (activePractice === 'stretch') {
    return { kind: 'stretch', presentation }
  }

  return { kind: 'resonant', presentation }
}

export interface PracticeSettingsSources {
  activePractice: PracticeId
  naviSessionActive: boolean
  resonant: {
    settings: SessionSettings
    isRunning: boolean
    isComplete: boolean
    onChange(this: void, settings: SessionSettings): void
    onExtendDuration(this: void, durationMinutes: number): void
  }
  stretch: {
    settings: StretchSettings
    isRunning: boolean
    isComplete: boolean
    onChange(this: void, settings: StretchSettings): void
  }
  naviKriya: {
    settings: NaviKriyaSettings
    isComplete: boolean
    onChange(this: void, settings: NaviKriyaSettings): void
  }
}

export function createPracticeSettingsViewModel(
  sources: PracticeSettingsSources,
): AppPracticeSettingsViewModel {
  if (sources.naviSessionActive) return { kind: 'hidden' }

  if (sources.activePractice === 'resonant') {
    return {
      kind: 'resonant',
      settings: sources.resonant.settings,
      isRunning: sources.resonant.isRunning,
      isComplete: sources.resonant.isComplete,
      onChange: sources.resonant.onChange,
      onExtendDuration: sources.resonant.onExtendDuration,
    }
  }

  if (sources.activePractice === 'stretch') {
    return {
      kind: 'stretch',
      settings: sources.stretch.settings,
      isRunning: sources.stretch.isRunning,
      isComplete: sources.stretch.isComplete,
      onChange: sources.stretch.onChange,
    }
  }

  return {
    kind: 'naviKriya',
    settings: sources.naviKriya.settings,
    isComplete: sources.naviKriya.isComplete,
    onChange: sources.naviKriya.onChange,
  }
}

export interface CreatePracticeControlsViewModelArgs {
  activePractice: PracticeId
  breathingAction: SessionPrimaryAction
  naviAction: SessionPrimaryAction
  strings: UiStrings['practice']['controls']
  breathingAudio: AppAudioToggleViewModel
  naviAudio: AppAudioToggleViewModel
  onBreathingPrimaryClick(this: void): void
  onNaviPrimaryClick(this: void): void
}

export function createPracticeControlsViewModel({
  activePractice,
  breathingAction,
  naviAction,
  strings,
  breathingAudio,
  naviAudio,
  onBreathingPrimaryClick,
  onNaviPrimaryClick,
}: CreatePracticeControlsViewModelArgs): AppPracticeControlsViewModel {
  const action = activePractice === 'naviKriya' ? naviAction : breathingAction

  return {
    primaryLabel: getSessionPrimaryActionLabel(action, strings),
    onPrimaryClick: activePractice === 'naviKriya'
      ? onNaviPrimaryClick
      : onBreathingPrimaryClick,
    audio: activePractice === 'naviKriya' ? naviAudio : breathingAudio,
  }
}

export function createAudioViewModel(input: {
  muted: boolean
  audioAvailable: boolean
  audioStatus: AudioStatusFlag
  onMuteToggle(this: void): void
}): AppAudioViewModel {
  return {
    muted: input.muted,
    audioAvailable: input.audioAvailable,
    audioStatus: input.audioStatus,
    needsResume: input.audioStatus === 'needs-resume',
    resumeHintId: AUDIO_RESUME_HINT_ID,
    onMuteToggle: input.onMuteToggle,
  }
}

export function createNaviAudioToggleViewModel(input: {
  muted: boolean
  audioAvailable: boolean
  onMuteToggle(this: void): void
}): AppAudioToggleViewModel {
  // Navi has no resume flow — leaving resumeHintId undefined keeps consumers
  // honest. MuteToggle gates aria-describedby on needsResume && resumeHintId.
  return {
    muted: input.muted,
    audioAvailable: input.audioAvailable,
    needsResume: false,
    onMuteToggle: input.onMuteToggle,
  }
}
