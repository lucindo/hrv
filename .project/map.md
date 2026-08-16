# Map

## Overview

A browser-based breathing timer for slow-paced (resonance / HRV) breathing practice,
for solo practitioners. Ships three practices — **HRV** (resonance timer), **Stretch**
(guided BPM walk-down across Warm-up / Ramp / Cool-down), and **Navi Kriya**
(OM-counting rounds) — each with its own settings form and local stats. Client-only:
no accounts, no backend, no network calls. Installable as an offline-capable PWA, and
wrapped as a native desktop app via Pake. Copy ships in EN and pt-BR.

## Stack

- **Language / runtime:** TypeScript `~6.0.2` (target ES2023), React 19, browser only.
- **Build:** Vite 8 (`vite.config.ts`), Tailwind CSS v4 via `@tailwindcss/vite`, PWA via
  `vite-plugin-pwa` (Workbox `generateSW`, `autoUpdate`).
- **Test:** Vitest 4 + Testing Library + jsdom (`vitest.setup.ts`), tests colocated beside source.
- **Lint:** ESLint 10 (`eslint.config.js`) — `tseslint.configs.strictTypeChecked` + React Hooks + React Refresh.
- **Runtime deps:** `react` / `react-dom` 19, `@fontsource-variable/inter` — nothing else.
- **Web APIs:** `AudioContext` (generated cues), `<dialog>` (modals), Page Visibility, Wake Lock, `localStorage`.
- **Commands:** `npm run dev` · `npm test` (watch) · `npm run test:run` (single pass) ·
  `npm run lint` · `npm run build` (`tsc -b` + Vite) · `npm run preview`.
- **Entry:** `index.html` → `src/main.tsx` → `src/app/App.tsx`.

## Repo map

| Path | Holds |
|------|-------|
| `src/app/` | React entry and routing. `App.tsx` is a thin shell (`UiStringsProvider` + `ScreenRouter`); practice/session state lives in `useAppViewModel.ts` and `ScreenRouter.tsx`. `PracticeScreen` + `PracticeSessionView` host per-practice surfaces (`BreathingSessionSurface`, `NaviKriyaSessionSurface`); `appViewModel.ts`, `setupCardSummary.ts`, `practiceCopy.ts`, `sessionPresentation.ts`, nav hooks (`useAppNavigation.ts`), `pages/`. |
| `src/components/` | UI: `PracticeToggle`, visual guides `OrbShape` (variants `orb-halo` / `minimal-rings` / `spiritual-eye`) and `NKShape`, readouts (`SessionReadout`, `NKSessionReadout`, `RoundsReadout`, `FeedbackCount`, `FeedbackTime`), settings forms (`ResonantSettingsForm` / `StretchSettingsForm` / `NaviKriyaSettingsForm`), `SettingsSheet` + `SettingsFormShell`, row primitives (`SettingsToggleRow`, `SettingsSegmentedRow`, `SettingsRow`, `SettingsSlider`, `SettingsStepper`), dialogs (`ConfirmDialog`, `EndSessionDialog`), `LearnAnchor`/`LearnPanel`, `IosInstallSteps`, `Theme`/`Cue`/`RingCue`/`Timbre`/`Language` pickers. |
| `src/domain/` | Pure logic, barrel `index.ts`: `breathingPlan`, `sessionMath`, `sessionController`, `sessionLifecycle`, `sessionAudio`, `roundsSession` (HRV interval rounds), `settings`, `stretchRamp` (segment table + per-frame lookup), `naviKriyaSession`, `naviKriyaSettings`. |
| `src/hooks/` | Session engines `useSessionEngine` (rAF lookahead + `lookaheadHeartbeat.worker.ts`) and `useNKEngine` (setTimeout metronome); controllers `useBreathingSessionController` / `useNaviKriyaSessionController`; audio hooks `useAudioCues` / `useNaviKriyaAudio`; `useWakeLock`, `useTheme`, `useFavicon`, `useVisualCue`, `useAmbientScale`, `usePrefersReducedMotion`, `useFeatureFlags`, `useLocale`, `useSnapToPresets`, `useAdvancedMode`, `useCueChoice`, `usePreferenceChoice`, PWA-install hooks (`useBeforeInstallPrompt`, `useIsStandaloneOrPhone`). |
| `src/audio/` | Web Audio layer: `audioEngine`, `audioStatus`, `cueSynth`, `nkCueSynth`, `timbres`, `sessionClock` (+ `swappableSessionClock`), `previewContext`, `silentLoopBypass`. |
| `src/content/` | Typed copy: `strings` (`UI_STRINGS`, EN + pt-BR), `learnContent`, `lockedCopy`. |
| `src/storage/` | `localStorage` layer, barrel `index.ts`: `storage` (envelope, `STATE_VERSION`, `migrateEnvelope`), per-practice `practices` (settings + stats coercers), `settings`, `stats`, `prefs`, `installDismissed`. |
| `src/styles/` | `theme.css` ("Mono Zen" palette, light/dark) and `faviconPalette.ts` (favicon color sync). |
| `src/featureFlags.ts` | Query-param flags: `switcherIcon`, `breathingShape`, `orbIdle`, `ringCue`, `bypassSilentMode`. |
| `public/` | Static PWA assets: favicon, apple-touch icon, 192/512 + maskable PWA icons. |
| `.github/workflows/` | `deploy.yml` — `v*`-tag-triggered multi-version GitHub Pages deploy driven by `versions.json`; `desktop.yml` — `desktop-v*`-tagged native builds (macOS / Windows / Linux via Pake). |
| `.project/` | Project state: `state.md`, `map.md`, runbooks `DEPLOYMENT.md` + `ADDING_A_PRACTICE.md`, and `archive/` (retired `PROJECT.md`, `PLAN.md`, `DECISIONS.md`, `SPEC.md`). |
| `dist/` | Build output (gitignored). |

Root: `index.html`, `versions.json` (deployed versions + `official` pointer), `vite.config.ts`,
`vitest.setup.ts`, `eslint.config.js`, `tsconfig.{json,app.json,node.json}`, `AGENTS.md` / `CLAUDE.md`.
