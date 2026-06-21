// UI strings catalog — all UI strings live here, not inline in components.
// UiStrings uses sub-objects per component/feature.
// Theme/variant/timbre option names are translated; picker labels use native endonyms.
// Interpolated strings are typed as functions.
// EN values are the literals currently shipped in source components.
// PT-BR values reviewed by a native speaker.
//
// Refactor F5: top-level keys reorganized by SURFACE
//   - practice.* — everything on PracticeScreen (header, controls, switcher,
//     breathing visuals, readouts, settings forms, mute toggle, end-session
//     confirmation modal, top bar anchor labels)
//   - appSettings.* — everything on AppSettingsPage (page chrome, picker
//     section labels, picker option labels)
//   - learn.* — everything on LearnPage (page chrome + body section headings)
//   - install.* — cross-surface install copy (banner on practice + install
//     row on appSettings + iOS steps)

import type { LocaleId } from '../domain'

export interface UiStrings {
  readonly practice: {
    readonly title: string
    readonly topBar: {
      readonly settings: string
      readonly settingsDisabled: string
      readonly learn: string
      readonly learnDisabled: string
    }
    readonly switcher: {
      readonly toggleLabel: string
      readonly resonantName: string
      readonly naviKriyaName: string
      readonly resonantHeading: string
      readonly naviKriyaHeading: string
      readonly stretchName: string
      readonly stretchHeading: string
    }
    readonly controls: {
      readonly startSession: string
      readonly endSession: string
      readonly cancel: string
      readonly done: string
    }
    readonly breathing: {
      readonly inhale: string
      readonly exhale: string
      readonly breathingShapeAriaLabel: string
      readonly leadInAriaLabel: (digit: number) => string
    }
    readonly readout: {
      readonly elapsed: string
      readonly remaining: string
      readonly statusLabel: string
      readonly readoutAriaLabel: string
      readonly announcementAriaLabel: string
      readonly sessionComplete: string
      readonly takeAMoment: string
      readonly currentBpmLabel: string
      readonly stageLabel: string
      readonly stageHoldInitial: string
      readonly stageRamp: string
      readonly stageHoldTarget: string
      readonly rest: string
      readonly roundOf: (current: number, total: number) => string
    }
    readonly settingsForm: {
      readonly ariaLabel: string
      readonly bpmLabel: string
      readonly ratioLabel: string
      readonly durationLabel: string
      readonly openEndedLabel: string
      readonly bpmUnit: string
      readonly minutesUnit: string
      readonly stepper: {
        readonly fieldAriaLabel: (label: string) => string
        readonly decreaseLabel: (label: string) => string
        readonly increaseLabel: (label: string) => string
      }
      readonly sessionModeLabel: string
      readonly modeStandard: string
      readonly modeStretch: string
      readonly initialBpmLabel: string
      readonly initialBpmShortLabel: string
      readonly targetBpmLabel: string
      readonly targetBpmShortLabel: string
      readonly startRatioLabel: string
      readonly targetRatioLabel: string
      readonly holdInitialLabel: string
      readonly holdTargetLabel: string
      readonly rampDurationLabel: string
      readonly holdOpenEndedLabel: string
      readonly roundsToggleLabel: string
      readonly roundsCountLabel: string
      readonly restBetweenLabel: string
    }
    readonly nkControls: {
      readonly roundsLabel: string
      readonly frontCountLabel: string
      readonly frontCountShortLabel: string
      readonly omLengthLabel: string
      readonly omLengthShortLabel: string
      readonly omLengthFast: string
      readonly omLengthMedium: string
      readonly omLengthSlow: string
      readonly perOmCueLabel: string
      readonly perOmCueOn: string
      readonly perOmCueOff: string
      readonly estimatedDuration: (minutes: number) => string
    }
    readonly nkReadout: {
      readonly statusLabel: string
      readonly readoutAriaLabel: string
      readonly announcementAriaLabel: string
      readonly phaseLabel: string
      readonly front: string
      readonly back: string
      readonly roundLabel: string
      readonly countLabel: string
      readonly roundOf: (current: number, total: number) => string
      readonly countOf: (current: number, total: number) => string
      readonly orbAriaLabel: (count: number, phaseLabel: string) => string
    }
    readonly mute: {
      readonly mute: string
      readonly unmute: string
      readonly resume: string
      readonly unavailable: string
      readonly audioPausedAnnouncement: string
    }
    readonly endSessionDialog: {
      readonly title: string
      readonly confirm: string
      readonly cancel: string
    }
    readonly settingsSheet: {
      readonly title: string
      readonly close: string
      readonly editCardAriaLabel: (practiceName: string) => string
    }
  }
  readonly appSettings: {
    readonly title: string
    readonly close: string
    readonly statsRow: string
    readonly themeLabel: string
    readonly cueLabel: string
    readonly timbreLabel: string
    readonly languageLabel: string
    readonly sections: {
      readonly statistics: string
      readonly theme: string
      readonly language: string
      readonly audio: string
      readonly about: string
    }
    readonly about: {
      readonly versionLabel: string
      readonly sourceLinkText: string
    }
    readonly themes: {
      readonly light: string
      readonly dark: string
      readonly system: string
    }
    readonly cue: {
      readonly labels: string
      readonly arrow: string
      readonly nose: string
    }
    readonly timbres: {
      readonly bowl: string
      readonly bell: string
      readonly sine: string
      readonly flute: string
    }
  }
  readonly advanced: {
    readonly title: string
    readonly backChevron: string
    readonly rightChevronAriaOnSettings: string
    readonly sections: {
      readonly orbStyle: string
      readonly behavior: string
    }
    readonly orb: {
      readonly label: string
      readonly options: {
        readonly halo: string
        readonly minimal: string
        readonly kuthasta: string
      }
    }
    readonly ringCue: {
      readonly label: string
      readonly options: {
        readonly arc: string
        readonly rings: string
      }
    }
    readonly breathingEffect: {
      readonly label: string
    }
    readonly switcherIcons: {
      readonly label: string
    }
    readonly bypassSilentMode: {
      readonly label: string
    }
    readonly preciseControl: {
      readonly label: string
    }
  }
  readonly learn: {
    readonly title: string
    readonly close: string
    readonly resourcesHeading: string
    readonly videosHeading: string
    readonly nativeAppsHeading: string
    readonly naviKriyaVideosHeading: string
  }
  readonly stats: {
    readonly title: string
    readonly back: string
    readonly fields: {
      readonly sessions: string
      readonly totalTime: string
      readonly lastSession: string
      readonly rounds: string
    }
    // Coarse total-time format past 72h: e.g. ≈15 days (365h).
    readonly totalTimeDays: (days: number, hours: number) => string
    readonly empty: string
    readonly reset: string
    readonly resetConfirm: {
      readonly title: (practice: string) => string
      readonly body: string
      readonly confirm: string
      readonly cancel: string
    }
    readonly privacyNote: string
  }
  readonly install: {
    readonly installButton: string
    readonly iosStepsButton: string
    readonly iosStep1: string
    readonly iosStep2: string
    readonly iosStep3: string
    readonly settingsLabel: string
  }
}

export const UI_STRINGS: Readonly<Record<LocaleId, UiStrings>> = {
  en: {
    practice: {
      title: 'HRV Breathing',
      topBar: {
        settings: 'Settings',
        settingsDisabled: 'Settings (unavailable during session)',
        learn: 'Learn',
        learnDisabled: 'Learn (unavailable during session)',
      },
      switcher: {
        toggleLabel: 'Switch practice',
        resonantName: 'HRV',
        naviKriyaName: 'Navi',
        resonantHeading: 'HRV Breathing',
        naviKriyaHeading: 'Navi Kriya',
        stretchName: 'Stretch',
        stretchHeading: 'HRV Stretch',
      },
      controls: {
        startSession: 'Start',
        endSession: 'End',
        cancel: 'Cancel',
        done: 'Done',
      },
      breathing: {
        inhale: 'In',
        exhale: 'Out',
        breathingShapeAriaLabel: 'Breathing shape',
        leadInAriaLabel: (d) => `Lead-in ${String(d)}`,
      },
      readout: {
        elapsed: 'Elapsed',
        remaining: 'Remaining',
        statusLabel: 'Status',
        readoutAriaLabel: 'Session readout',
        announcementAriaLabel: 'Session announcement',
        sessionComplete: 'Session complete',
        takeAMoment: 'Take a moment',
        currentBpmLabel: 'BPM',
        stageLabel: 'Stage',
        stageHoldInitial: 'Warm-up',
        stageRamp: 'Stretch',
        stageHoldTarget: 'Settle',
        rest: 'Rest',
        roundOf: (c, t) => `Round ${String(c)} of ${String(t)}`,
      },
      settingsForm: {
        ariaLabel: 'Session settings',
        bpmLabel: 'BPM',
        ratioLabel: 'Ratio',
        durationLabel: 'Duration',
        openEndedLabel: '∞',
        bpmUnit: 'BPM',
        minutesUnit: 'min',
        stepper: {
          fieldAriaLabel: (l) => l,
          decreaseLabel: (l) => `Decrease ${l}`,
          increaseLabel: (l) => `Increase ${l}`,
        },
        sessionModeLabel: 'Session mode',
        modeStandard: 'Standard',
        modeStretch: 'Stretch',
        initialBpmLabel: 'Start BPM',
        initialBpmShortLabel: 'Start',
        targetBpmLabel: 'Target BPM',
        targetBpmShortLabel: 'Target',
        startRatioLabel: 'Start Ratio',
        targetRatioLabel: 'Target Ratio',
        holdInitialLabel: 'Warm-up',
        holdTargetLabel: 'Settle',
        rampDurationLabel: 'Stretch',
        holdOpenEndedLabel: '∞',
        roundsToggleLabel: 'Rounds',
        roundsCountLabel: 'Number of rounds',
        restBetweenLabel: 'Rest between rounds',
      },
      nkControls: {
        roundsLabel: 'Rounds',
        frontCountLabel: 'Front OMs',
        frontCountShortLabel: 'OMs',
        omLengthLabel: 'OM pace',
        omLengthShortLabel: 'Pace',
        omLengthFast: 'Fast',
        omLengthMedium: 'Medium',
        omLengthSlow: 'Slow',
        perOmCueLabel: 'OM tick',
        perOmCueOn: 'On',
        perOmCueOff: 'Off',
        estimatedDuration: (m) => `~${String(m)} min`,
      },
      nkReadout: {
        statusLabel: 'Status',
        readoutAriaLabel: 'Navi Kriya session readout',
        announcementAriaLabel: 'Navi Kriya session announcement',
        phaseLabel: 'Phase',
        front: 'Front',
        back: 'Back',
        roundLabel: 'Round',
        countLabel: 'Count',
        roundOf: (c, t) => `${String(c)} / ${String(t)}`,
        countOf: (c, t) => `${String(c)} / ${String(t)}`,
        orbAriaLabel: (c, p) => `Navi Kriya session: OM ${String(c)}, phase ${p}`,
      },
      mute: {
        mute: 'Mute audio cues',
        unmute: 'Unmute audio cues',
        resume: 'Resume audio',
        unavailable: 'Audio unavailable in this browser',
        audioPausedAnnouncement: 'Audio paused, tap to resume',
      },
      endSessionDialog: {
        title: 'End this session?',
        confirm: 'End',
        cancel: 'Keep going',
      },
      settingsSheet: {
        title: 'Practice',
        close: 'Close',
        editCardAriaLabel: (name) => `Edit ${name} settings`,
      },
    },
    appSettings: {
      title: 'Settings',
      close: 'Close',
      statsRow: 'View Practices Statistics',
      themeLabel: 'Theme',
      cueLabel: 'Cue style',
      timbreLabel: 'Timbre',
      languageLabel: 'Language',
      sections: {
        statistics: 'Statistics',
        theme: 'Theme',
        language: 'Language',
        audio: 'Feedback',
        about: 'About',
      },
      about: {
        versionLabel: 'Version',
        sourceLinkText: 'Source',
      },
      themes: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      cue: {
        labels: 'Text',
        arrow: 'Arrow',
        nose: 'Nose',
      },
      timbres: {
        bowl: 'Bowl',
        bell: 'Bell',
        sine: 'Sine',
        flute: 'Flute',
      },
    },
    advanced: {
      title: 'Advanced',
      backChevron: 'Back to Settings',
      rightChevronAriaOnSettings: 'Advanced settings',
      sections: { orbStyle: 'Orb Style', behavior: 'Behavior' },
      orb: { label: 'Orb', options: { halo: 'Halo', minimal: 'Minimal', kuthasta: 'Kuthasta' } },
      ringCue: { label: 'Ring cue', options: { arc: 'Arc', rings: 'Rings' } },
      breathingEffect: { label: 'Breathing effect' },
      switcherIcons: { label: 'Switcher icons' },
      bypassSilentMode: { label: 'Bypass silent mode' },
      preciseControl: { label: 'Precise control' },
    },
    learn: {
      title: 'About this practice',
      close: 'Close',
      resourcesHeading: 'Forrest Knutson Resources',
      videosHeading: 'Selected HRV Breathing Videos',
      nativeAppsHeading: 'Resonant Breathing app',
      naviKriyaVideosHeading: 'Selected Navi Kriya Videos',
    },
    stats: {
      title: 'Statistics',
      back: 'Back to Settings',
      fields: {
        sessions: 'Sessions',
        totalTime: 'Total time',
        lastSession: 'Last session',
        rounds: 'Rounds',
      },
      totalTimeDays: (days, hours) => `≈${String(days)} days (${String(hours)}h)`,
      empty: '—',
      reset: 'Reset',
      resetConfirm: {
        title: (practice) => `Reset ${practice} stats?`,
        body: "This clears this practice's saved history. It can't be undone.",
        confirm: 'Reset',
        cancel: 'Keep',
      },
      privacyNote:
        'This app has no account and tracks nothing. These stats live only in this browser, on this device — clearing site data, switching browsers, or private browsing resets them.',
    },
    install: {
      installButton: 'Install',
      iosStepsButton: 'How to install',
      iosStep1: "Tap the Share button in Safari's toolbar",
      iosStep2: 'Tap "Add to Home Screen"',
      iosStep3: 'Tap "Add" to confirm',
      settingsLabel: 'Install for offline use',
    },
  },
  'pt-BR': {
    practice: {
      title: 'Respiração VFC',
      topBar: {
        settings: 'Configurações',
        settingsDisabled: 'Configurações (indisponível durante a sessão)',
        learn: 'Saiba mais',
        learnDisabled: 'Saiba mais (indisponível durante a sessão)',
      },
      switcher: {
        toggleLabel: 'Trocar de prática',
        resonantName: 'VFC',
        naviKriyaName: 'Navi',
        resonantHeading: 'Respiração VFC',
        naviKriyaHeading: 'Navi Kriya',
        stretchName: 'Alongar',
        stretchHeading: 'Alongar VFC',
      },
      controls: {
        startSession: 'Iniciar',
        endSession: 'Encerrar',
        cancel: 'Cancelar',
        done: 'Concluído',
      },
      breathing: {
        inhale: 'Puxa',
        exhale: 'Solta',
        breathingShapeAriaLabel: 'Forma de respiração',
        leadInAriaLabel: (d) => `Contagem regressiva ${String(d)}`,
      },
      readout: {
        elapsed: 'Decorrido',
        remaining: 'Restante',
        statusLabel: 'Status',
        readoutAriaLabel: 'Informações da sessão',
        announcementAriaLabel: 'Anúncio da sessão',
        sessionComplete: 'Sessão concluída',
        takeAMoment: 'Respire fundo',
        currentBpmLabel: 'RPM',
        stageLabel: 'Fase',
        stageHoldInitial: 'Aquecimento',
        stageRamp: 'Progressão',
        stageHoldTarget: 'Estabilizar',
        rest: 'Descanso',
        roundOf: (c, t) => `Rodada ${String(c)} de ${String(t)}`,
      },
      settingsForm: {
        ariaLabel: 'Configurações da sessão',
        bpmLabel: 'RPM',
        ratioLabel: 'Proporção',
        durationLabel: 'Duração',
        openEndedLabel: '∞',
        bpmUnit: 'RPM',
        minutesUnit: 'min',
        stepper: {
          fieldAriaLabel: (l) => l,
          decreaseLabel: (l) => `Diminuir ${l}`,
          increaseLabel: (l) => `Aumentar ${l}`,
        },
        sessionModeLabel: 'Modo de sessão',
        modeStandard: 'Padrão',
        modeStretch: 'Progressivo',
        initialBpmLabel: 'RPM inicial',
        initialBpmShortLabel: 'Inicial',
        targetBpmLabel: 'RPM alvo',
        targetBpmShortLabel: 'Alvo',
        startRatioLabel: 'Proporção Inicial',
        targetRatioLabel: 'Proporção Alvo',
        holdInitialLabel: 'Aquecimento',
        holdTargetLabel: 'Estabilizar',
        rampDurationLabel: 'Progressão',
        holdOpenEndedLabel: '∞',
        roundsToggleLabel: 'Rodadas',
        roundsCountLabel: 'Número de rodadas',
        restBetweenLabel: 'Descanso entre rodadas',
      },
      nkControls: {
        roundsLabel: 'Rodadas',
        frontCountLabel: 'OMs de frente',
        frontCountShortLabel: 'OMs',
        omLengthLabel: 'Ritmo do OM',
        omLengthShortLabel: 'Ritmo',
        omLengthFast: 'Rápido',
        omLengthMedium: 'Médio',
        omLengthSlow: 'Lento',
        perOmCueLabel: 'Toque do OM',
        perOmCueOn: 'Ligado',
        perOmCueOff: 'Desligado',
        estimatedDuration: (m) => `~${String(m)} min`,
      },
      nkReadout: {
        statusLabel: 'Status',
        readoutAriaLabel: 'Resumo da sessão de Navi Kriya',
        announcementAriaLabel: 'Anúncio da sessão de Navi Kriya',
        phaseLabel: 'Fase',
        front: 'Frente',
        back: 'Costas',
        roundLabel: 'Rodada',
        countLabel: 'Contagem',
        roundOf: (c, t) => `${String(c)} / ${String(t)}`,
        countOf: (c, t) => `${String(c)} / ${String(t)}`,
        orbAriaLabel: (c, p) => `Sessão Navi Kriya: OM ${String(c)}, fase ${p}`,
      },
      mute: {
        mute: 'Silenciar sons',
        unmute: 'Reativar sons',
        resume: 'Retomar áudio',
        unavailable: 'Áudio indisponível neste navegador',
        audioPausedAnnouncement: 'Áudio pausado, toque para retomar',
      },
      endSessionDialog: {
        title: 'Encerrar esta sessão?',
        confirm: 'Encerrar',
        cancel: 'Continuar',
      },
      settingsSheet: {
        title: 'Prática',
        close: 'Fechar',
        editCardAriaLabel: (name) => `Editar configurações de ${name}`,
      },
    },
    appSettings: {
      title: 'Configurações',
      close: 'Fechar',
      statsRow: 'Ver Estatísticas das Práticas',
      themeLabel: 'Tema',
      cueLabel: 'Estilo de guia',
      timbreLabel: 'Timbre',
      languageLabel: 'Idioma',
      sections: {
        // TODO: native-speaker review
        statistics: 'Estatísticas',
        theme: 'Tema',
        language: 'Idioma',
        audio: 'Feedback',
        about: 'Sobre',
      },
      about: {
        versionLabel: 'Versão',
        sourceLinkText: 'Código-fonte',
      },
      themes: {
        light: 'Claro',
        dark: 'Escuro',
        system: 'Sistema',
      },
      cue: {
        labels: 'Texto',
        arrow: 'Seta',
        nose: 'Nariz',
      },
      timbres: {
        bowl: 'Tigela',
        bell: 'Sino',
        sine: 'Senoidal',
        flute: 'Flauta',
      },
    },
    advanced: {
      title: 'Avançado',
      // TODO: native-speaker review
      backChevron: 'Voltar para Configurações',
      rightChevronAriaOnSettings: 'Configurações avançadas',
      sections: {
        // TODO: native-speaker review
        orbStyle: 'Estilo do orbe',
        behavior: 'Comportamento',
      },
      orb: {
        // TODO: native-speaker review
        label: 'Orbe',
        options: {
          // TODO: native-speaker review
          halo: 'Halo',
          // TODO: native-speaker review
          minimal: 'Mínimo',
          // TODO: native-speaker review
          kuthasta: 'Kuthasta',
        },
      },
      ringCue: {
        // TODO: native-speaker review
        label: 'Sinal do anel',
        options: {
          // TODO: native-speaker review
          arc: 'Arco',
          // TODO: native-speaker review
          rings: 'Anéis',
        },
      },
      breathingEffect: {
        // TODO: native-speaker review
        label: 'Efeito de respiração',
      },
      switcherIcons: {
        // TODO: native-speaker review
        label: 'Ícones do alternador',
      },
      bypassSilentMode: { label: 'Ignorar modo silencioso' },
      preciseControl: { label: 'Controle preciso' },
    },
    learn: {
      title: 'Sobre esta prática',
      close: 'Fechar',
      resourcesHeading: 'Recursos do Forrest Knutson',
      videosHeading: 'Vídeos selecionados de respiração VFC',
      nativeAppsHeading: 'App Resonant Breathing',
      naviKriyaVideosHeading: 'Vídeos selecionados de Navi Kriya',
    },
    stats: {
      title: 'Estatísticas',
      back: 'Voltar para Configurações',
      fields: {
        sessions: 'Sessões',
        totalTime: 'Tempo total',
        lastSession: 'Última sessão',
        rounds: 'Rodadas',
      },
      totalTimeDays: (days, hours) => `≈${String(days)} dias (${String(hours)}h)`,
      empty: '—',
      reset: 'Zerar',
      resetConfirm: {
        title: (practice) => `Zerar estatísticas de ${practice}?`,
        body: 'Isso apaga o histórico salvo desta prática. Não dá para desfazer.',
        confirm: 'Zerar',
        cancel: 'Manter',
      },
      privacyNote:
        'Este app não tem conta e não rastreia nada. Estas estatísticas vivem apenas neste navegador, neste dispositivo — limpar os dados do site, trocar de navegador ou usar uma janela anônima zera tudo.',
    },
    install: {
      installButton: 'Instalar',
      iosStepsButton: 'Como instalar',
      iosStep1: 'Toque no botão Compartilhar na barra do Safari',
      iosStep2: 'Toque em "Adicionar à Tela de Início"',
      iosStep3: 'Toque em "Adicionar" para confirmar',
      settingsLabel: 'Instalar para uso offline',
    },
  },
} as const satisfies Readonly<Record<LocaleId, UiStrings>>

export const LOCALE_DISPLAY_NAMES: Readonly<Record<LocaleId, string>> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
} as const satisfies Readonly<Record<LocaleId, string>>
