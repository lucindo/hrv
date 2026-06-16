import { useEffect, useRef, type ReactElement } from 'react'

import { ChevronBackIcon } from '../../components/icons'
import { OrbPicker } from '../../components/OrbPicker'
import { RingCuePicker } from '../../components/RingCuePicker'
import { SettingsSectionHeader } from '../../components/SettingsSectionHeader'
import { SettingsToggleRow } from '../../components/SettingsToggleRow'
import { IconButton } from '../../components/primitives/IconButton'
import { PageShell } from '../../components/primitives/PageShell'
import { SectionCard } from '../../components/primitives/SectionCard'
import { TopAppBar } from '../../components/primitives/TopAppBar'
import { usePreferenceChoice } from '../../hooks/usePreferenceChoice'
import { useUiStrings } from '../../hooks/useUiStringsContext'

export interface AdvancedPageProps {
  onBack(this: void): void
}

/** Full-page Advanced surface. Composes PageShell + TopAppBar (back
 *  chevron in the leading slot) + two SectionCards. Focuses the back
 *  chevron on mount. Changes apply live across the app via the choice-hook setters. */
export function AdvancedPage({ onBack }: AdvancedPageProps): ReactElement {
  const strings = useUiStrings().advanced
  const [orbIdle, setOrbIdle] = usePreferenceChoice('orbIdle')
  const [switcherIcon, setSwitcherIcon] = usePreferenceChoice('switcherIcon')
  const [bypassSilentMode, setBypassSilentMode] = usePreferenceChoice('bypassSilentMode')
  const [advanced, setAdvanced] = usePreferenceChoice('advanced')
  const backButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <PageShell>
      <TopAppBar
        title={strings.title}
        leading={
          <IconButton
            icon={<ChevronBackIcon />}
            label={strings.backChevron}
            onClick={onBack}
            buttonRef={backButtonRef}
          />
        }
      />
      <div className="w-full text-left">
        <SettingsSectionHeader label={strings.sections.orbStyle} />
        <SectionCard padding="16px">
          <div className="grid gap-4">
            <OrbPicker
              disabled={false}
              sectionLabel={strings.orb.label}
              sectionLabelHidden={false}
              strings={strings.orb.options}
            />
            <RingCuePicker
              disabled={false}
              sectionLabel={strings.ringCue.label}
              sectionLabelHidden={false}
              strings={strings.ringCue.options}
            />
          </div>
        </SectionCard>

        <SettingsSectionHeader label={strings.sections.behavior} />
        <SectionCard padding="16px">
          <SettingsToggleRow
            label={strings.breathingEffect.label}
            ariaLabel={strings.breathingEffect.label}
            checked={orbIdle === 'ambient'}
            onChange={(next) => {
              setOrbIdle(next ? 'ambient' : 'still')
            }}
          />
          <SettingsToggleRow
            label={strings.switcherIcons.label}
            ariaLabel={strings.switcherIcons.label}
            checked={switcherIcon}
            onChange={setSwitcherIcon}
          />
          {/* Changing this toggle mid-session does NOT rebuild the audio engine. The flag
              is read at engine construction time (Start click / reconstruct); a toggle
              change applies on the next engine construction via bypassSilentModeRef. */}
          <SettingsToggleRow
            label={strings.bypassSilentMode.label}
            ariaLabel={strings.bypassSilentMode.label}
            checked={bypassSilentMode}
            onChange={setBypassSilentMode}
          />
          <SettingsToggleRow
            label={strings.preciseControl.label}
            ariaLabel={strings.preciseControl.label}
            checked={advanced}
            onChange={setAdvanced}
          />
        </SectionCard>
      </div>
    </PageShell>
  )
}
