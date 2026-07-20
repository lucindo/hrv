# HRV Breathing

## Overview

A calm, browser-based breathing timer for slow-paced (resonance / HRV) breathing
practice. No accounts, no tracking, no backend, no medical claims — open a tab,
pick a rate, and breathe. The practice protocol is inspired by Forrest Knutson's
HRV teaching (independent and unaffiliated). Ships three practices — **HRV**
(resonance timer), **Stretch** (guided BPM ramp), and **Navi Kriya** (OM-counting
rounds) — each with its own settings and local stats. Installable as an
offline-capable PWA.

## Stack

- **Language / runtime:** TypeScript `~6.0.2` (target ES2023), React 19, browser only.
- **Build:** Vite 8 (`vite.config.ts`), Tailwind CSS v4 via `@tailwindcss/vite`, PWA via `vite-plugin-pwa` (Workbox `generateSW`, auto-update).
- **Test:** Vitest 4 + Testing Library + jsdom (`vitest.setup.ts`). ~112 test files colocated next to source.
- **Lint:** ESLint 10 (`eslint.config.js`) — TypeScript + React Hooks + React Refresh rule packs.
- **Key deps:** `react` / `react-dom` 19, `@fontsource-variable/inter`. No runtime backend deps.
- **Web APIs used:** `AudioContext` (generated cues), `<dialog>` (modals), Page Visibility / Wake Lock, `localStorage`.
- **Commands:** `npm run dev` · `npm test` (watch) · `npm run test:run` (single pass) · `npm run lint` · `npm run build` · `npm run preview`.
- **Entry:** `index.html` → `src/main.tsx` → `src/app/App.tsx`.

## Repo map

| Path | Holds |
|------|-------|
| `src/app/` | React entry. `App.tsx` wires the page and owns practice/session state; `PracticeScreen` + `PracticeSessionView` host per-practice surfaces (`BreathingSessionSurface`, `NaviKriyaSessionSurface`); `appViewModel` + nav hooks; `LearnPage` route. |
| `src/components/` | UI: `PracticeToggle` switcher, `OrbShape` (`orb-halo` / `minimal-rings`) + `NKShape` guides, readouts, settings forms (`Resonant` / `Stretch` / `NaviKriya`), `SettingsSheet`, dialogs, `Learn` anchor/panel, install steps, and Theme/Cue/Timbre/Language pickers. `primitives/`, `icons/`. |
| `src/domain/` | Pure logic (barrel `index.ts`): `breathingPlan`, `sessionMath`, `sessionController`, `sessionLifecycle`, `sessionAudio`, `roundsSession` (HRV interval rounds), `settings`, `stretchRamp`, `naviKriyaSession`, `naviKriyaSettings`. |
| `src/hooks/` | Session engines `useSessionEngine` (rAF lookahead) + `useNKEngine` (setTimeout metronome) — **separate by design**; session controllers, audio cue hooks, `useWakeLock`, `useTheme`, `useVisualCue`, `useFeatureFlags`, `useLocale`, PWA-install hooks, `lookaheadHeartbeat.worker.ts`. |
| `src/audio/` | Web Audio layer: `audioEngine`, `audioStatus`, `cueSynth`, `nkCueSynth`, `timbres`, `sessionClock` (+ `swappableSessionClock`), `previewContext`, `silentLoopBypass`. |
| `src/content/` | Typed copy: `learnContent`, `strings` (EN / PT-BR), `lockedCopy`. |
| `src/storage/` | `localStorage` wrappers (barrel `index.ts`): per-practice `settings` + `stats`, `prefs`, `practices`, `installDismissed`. |
| `src/styles/` | `theme.css` ("Mono Zen" palette, light/dark) + favicon palette sync. |
| `src/featureFlags.ts` | Query-param flags: `switcherIcon`, `breathingShape`, `orbIdle`, `ringCue`, `bypassSilentMode`. |
| `.github/workflows/` | `deploy.yml` — tag-triggered multi-version GitHub Pages deploy; `desktop.yml` — `desktop-v*`-tagged native app builds (macOS/Windows/Linux via Pake). |
| `dist/` | Build output (gitignored content). |

## Constraints

- **No backend / telemetry / analytics / third-party scripts.** Settings and stats stay in `localStorage` on-device.
- **Not medical advice** — guided breathing practice only; no diagnostic or clinical claims in copy.
- **Two session engines stay separate.** `useSessionEngine` (rAF lookahead, breathing) and `useNKEngine` (setTimeout metronome, Navi Kriya) are intentionally different — do not merge.
- **TypeScript strict, no `any`.** See `AGENTS.md` language profile (strict tsconfig, discriminated unions, Result types at boundaries, refactor functions over 70 lines).
- **Wake Lock is progressive enhancement** — sessions must run correctly when it's unavailable (e.g. iOS < 18.4 standalone PWA, WebKit bug 254545).
- **Honor `prefers-reduced-motion`** — visual guide swaps animation for a static crossfade.
- **Multi-version Pages deploy:** tags are short form `vX.Y` (must match `package.json.version` first two segments); `versions.json` drives the root `official` redirect; the append-versions-json commit-back uses `[skip ci]` and the workflow has no `push: branches` trigger (loop guard). See `deploy.yml` header warning.
