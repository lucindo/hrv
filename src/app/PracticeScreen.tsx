import { useCallback, useState, type ReactElement } from 'react'

import { LearnAnchor } from '../components/LearnAnchor'
import { PageShell } from '../components/primitives/PageShell'
import { TopAppBar } from '../components/primitives/TopAppBar'
import { PracticeToggle } from '../components/PracticeToggle'
import { SettingsAnchor } from '../components/SettingsAnchor'
import { useAdvancedMode } from '../hooks/useAdvancedMode'
import type { AppViewModel } from './appViewModel'
import { EndSessionDialogsView } from './EndSessionDialogsView'
import { PracticeControlsView } from './PracticeControlsView'
import { PracticeSessionView } from './PracticeSessionView'
import { PracticeSettingsView } from './PracticeSettingsView'

interface PracticeScreenProps {
  vm: AppViewModel
}

/** The practice surface — the appScreen='practice' route. Top group (top bar →
 *  switcher → orb → variable region) anchors to viewport top; flex-1 spacer absorbs
 *  remaining vertical space; bottom group (controls → disclaimer) anchors to viewport
 *  bottom with a 16 px min-gap above Start. The orb's y-position is constant
 *  across practice × phase combinations. */
export function PracticeScreen({ vm }: PracticeScreenProps): ReactElement {
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
  const onOpenSettingsSheet = useCallback(() => { setSettingsSheetOpen(true) }, [])
  const onCloseSettingsSheet = useCallback(() => { setSettingsSheetOpen(false) }, [])
  const advanced = useAdvancedMode()

  // Auto-close the sheet on the Idle→in-session edge so the modal backdrop
  // never covers the running orb. The resonant extend-duration affordance
  // stays reachable by re-tapping the SetupCard while Running. Uses the
  // setState-during-render pattern (React docs: storing info from previous
  // renders) to avoid the react-hooks/set-state-in-effect anti-pattern.
  const [wasInSession, setWasInSession] = useState(vm.controlsDisabled)
  if (vm.controlsDisabled !== wasInSession) {
    setWasInSession(vm.controlsDisabled)
    if (vm.controlsDisabled && settingsSheetOpen) setSettingsSheetOpen(false)
  }

  return (
    <PageShell width="practice" overlays={<EndSessionDialogsView dialogs={vm.dialogs} />}>
      <TopAppBar
        title={vm.appTitle}
        leading={
          <SettingsAnchor
            disabled={vm.controlsDisabled}
            onClick={vm.navigation.onSettingsOpen}
            strings={vm.uiStrings.practice.topBar}
          />
        }
        trailing={
          <LearnAnchor
            disabled={vm.controlsDisabled}
            onClick={vm.navigation.onLearnOpen}
            strings={vm.uiStrings.practice.topBar}
          />
        }
      />
      <div className="w-full px-5 pb-4 sm:px-8">
        <div className="mx-auto w-full sm:max-w-[400px]">
          <PracticeToggle
            active={vm.activePractice}
            disabled={vm.controlsDisabled}
            showIcons={vm.featureFlags.switcherIcon}
            onSwitch={vm.onSwitchPractice}
            strings={vm.practiceToggleStrings}
          />
        </div>
      </div>
      <div className="flex w-full flex-col items-center px-5 pt-[18px] sm:px-8 sm:pt-7">
        <PracticeSessionView
          session={vm.practiceSession}
          variant={vm.featureFlags.breathingShape}
          idleMode={vm.featureFlags.orbIdle}
          ringCue={vm.featureFlags.ringCue}
        />
        <PracticeSettingsView
          settings={vm.practiceSettings}
          isSheetOpen={settingsSheetOpen}
          advanced={advanced}
          onOpenSheet={onOpenSettingsSheet}
          onCloseSheet={onCloseSettingsSheet}
        />
      </div>
      <div className="flex-1" />
      <div className="w-full px-5 pt-4 sm:px-8">
        <div className="mx-auto w-full sm:max-w-[400px]">
          <PracticeControlsView controls={vm.practiceControls} audio={vm.audio} />
        </div>
      </div>
      <p
        className="w-full whitespace-nowrap px-5 pt-3 text-center text-[11px] font-normal leading-[1.4] tracking-[0.02em] text-[var(--color-breathing-muted)] sm:px-8"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {vm.lockedCopy.medicalAdviceLine}
      </p>
    </PageShell>
  )
}
