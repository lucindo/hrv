import type { SetupCardItem } from '../components/SetupCard'
import type { UiStrings } from '../content/strings'
import type { OmLength } from '../domain'
import { NK_OM_SECONDS, OM_LENGTH_OPTIONS, formatRatio, formatTrimmed } from '../domain'
import type { AppPracticeSettingsViewModel } from './appViewModel'

export interface BuildSetupCardSummaryArgs {
  settings: AppPracticeSettingsViewModel
  practice: UiStrings['practice']
}

// Maps the practice-settings viewmodel into pre-formatted SetupCard items
// using the existing per-practice form labels + units. Returns null when the
// card should not render (navi session active → kind 'hidden'; stretch +
// isRunning → no in-session controls per J10 OQ-2 "hide on Stretch Running").
// Resonant + isRunning keeps the card visible to preserve the extend-duration
// affordance (the form gates everything except the Duration stepper).
export function buildSetupCardSummary({
  settings,
  practice,
}: BuildSetupCardSummaryArgs): readonly SetupCardItem[] | null {
  if (settings.kind === 'hidden') return null

  const f = practice.settingsForm

  if (settings.kind === 'resonant') {
    // Congruence with stretch + navi: nothing on screen during a running
    // session. The extend-duration logic in the controller + viewmodel
    // (settings.onExtendDuration) is intentionally retained but unwired
    // from the practice surface — see PracticeSettingsView for the docs.
    // Also hidden on Complete so the "Session complete" / "Take a moment"
    // panel reads alone, matching the spike's complete state.
    if (settings.isRunning || settings.isComplete) return null
    const s = settings.settings
    return [
      { id: 'bpm', label: f.bpmLabel, value: `${formatTrimmed(s.bpm)} ${f.bpmUnit}` },
      { id: 'ratio', label: f.ratioLabel, value: formatRatio(s.inhaleShare) },
      {
        id: 'duration',
        label: f.durationLabel,
        value:
          s.durationMinutes === 'open-ended'
            ? f.openEndedLabel
            : `${String(s.durationMinutes)} ${f.minutesUnit}`,
      },
    ]
  }

  if (settings.kind === 'stretch') {
    if (settings.isRunning || settings.isComplete) return null
    const s = settings.settings
    // Visual summary only: 3 cells matching the HRV card shape. The actual
    // configuration (warm-up / ramp / cool-down / ratio) stays in the
    // SettingsSheet form. Duration = warmUp + ramp + coolDown; if coolDown is
    // open-ended the whole total is open-ended.
    const durationValue =
      s.coolDownMinutes === 'open-ended'
        ? f.openEndedLabel
        : `${String(s.warmUpMinutes + s.rampDurationMinutes + s.coolDownMinutes)} ${f.minutesUnit}`
    return [
      { id: 'initialBpm', label: f.initialBpmShortLabel, value: `${formatTrimmed(s.initialBpm)} ${f.bpmUnit}` },
      { id: 'targetBpm', label: f.targetBpmShortLabel, value: `${formatTrimmed(s.targetBpm)} ${f.bpmUnit}` },
      { id: 'duration', label: f.durationLabel, value: durationValue },
    ]
  }

  if (settings.isComplete) return null

  const n = settings.settings
  const nk = practice.nkControls
  const omLengthLabel = formatOmLength(n.omSeconds, nk)
  return [
    { id: 'rounds', label: nk.roundsLabel, value: String(n.rounds) },
    { id: 'frontCount', label: nk.frontCountShortLabel, value: String(n.frontCount) },
    { id: 'omLength', label: nk.omLengthShortLabel, value: omLengthLabel },
  ]
}

function formatOmLength(omSeconds: number, nk: UiStrings['practice']['nkControls']): string {
  // Preset seconds reverse-map to their named label; a free (advanced) value that
  // matches no preset shows its seconds, matching the slider readout.
  const label = (OM_LENGTH_OPTIONS as readonly OmLength[]).find((k) => NK_OM_SECONDS[k] === omSeconds)
  if (label === 'fast') return nk.omLengthFast
  if (label === 'slow') return nk.omLengthSlow
  if (label === 'medium') return nk.omLengthMedium
  return `${formatTrimmed(omSeconds)} s`
}

// Resolves the per-practice display name used for the SetupCard aria-label
// and the SettingsSheet subtitle. Reuses the existing switcher headings so no
// new strings are needed for the practice name itself.
export function resolveSheetPracticeName(
  settings: AppPracticeSettingsViewModel,
  switcher: UiStrings['practice']['switcher'],
): string | null {
  if (settings.kind === 'resonant') return switcher.resonantHeading
  if (settings.kind === 'stretch') return switcher.stretchHeading
  if (settings.kind === 'naviKriya') return switcher.naviKriyaHeading
  return null
}
