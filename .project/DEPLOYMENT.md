# Deployment & Release Runbook

How `lucindo.github.io/hrv/` is built and released. Source of truth:
`.github/workflows/deploy.yml` (read it only when changing the pipeline; this doc
is the operating summary). See also memory `project_versioned_pages_deploy.md`.

## Model in one paragraph

The site is a **multi-version** GitHub Pages deploy. Each released **minor** line
gets a short tag `vX.Y` and a subpath `/hrv/vX.Y/`. One version is **official** and
is additionally built at the root `/hrv/`. Patches (`2.5.0 → 2.5.1`) do **not** get
a new tag — they **reuse** the `vX.Y` slot by moving the tag. The deploy is driven
entirely by **pushing a `vX.Y` tag** (or `workflow_dispatch`); pushing to `main`
never deploys.

## The three coupled artifacts

| Artifact | Form | Drives |
|----------|------|--------|
| `package.json` `version` | full SemVer `2.5.1` | validated against the pushed tag (first two segments → `v2.5`) |
| Git tag | short `vX.Y` (annotated) | **the trigger**; selects the commit to build at `/hrv/vX.Y/` |
| `versions.json` `official` | short `vX.Y` | which tag is rebuilt at root `/hrv/` |
| `versions.json` `versions[]` | short `vX.Y[]` | the version list; appended automatically on tag push |

Invariant enforced by CI: **pushed tag == `v` + first two segments of
`package.json.version`** (`2.5.1` → `v2.5`). Mismatch fails `validate-version`.
`versions.json` entries are short form only (`^v[0-9]+\.[0-9]+$`) — never a patch.

## Trigger & loop guard

- Trigger: `push` of tags `v*`, plus manual `workflow_dispatch`.
- **No `push: branches` trigger — on purpose.** `append-versions-json` commits back
  to `main`; a branches trigger would infinite-loop. The `[skip ci]` on that commit
  is defense-in-depth; the missing branches trigger is the real guard. Do not add one.

## Jobs (what the pipeline does)

1. `validate-version` — tag must match `package.json.version` short form.
2. `read-manifest` — validates `versions.json`, outputs `official`. **Reads
   `versions.json` from the pushed tag's tree** (checkout defaults to `github.ref`),
   not from `main`. So the tag you push must already contain the intended `official`.
3. `build-current` (push only) — builds the pushed tag at base `/hrv/vX.Y/`.
4. `build-archives` — matrix of frozen old tags (currently just `v1.5`) at `/hrv/<tag>/`.
5. `build-root` — builds the **official** tag at base `/hrv/`. Runs every time
   (idempotent).
6. `assemble-and-deploy` — root (official) + archives + current-tag subpath → Pages.
7. `append-versions-json` (push only) — if the pushed tag isn't in `versions.json`,
   append + sort + commit back to `main` (`[skip ci]`, via `VERSIONS_JSON_PAT` or
   `GITHUB_TOKEN`).

Resulting layout: `/hrv/` = official · `/hrv/vX.Y/` = each version · `/hrv/v1.5/` = archive.

## Procedures

### Patch release (e.g. 2.5.0 → 2.5.1) — reuse the slot, MOVE the tag
1. Bump `package.json` `version` to `2.5.1` (first two segments stay `2.5`). Merge to `main`.
2. Sync `main` locally.
3. Move the annotated tag to the new commit and force-push:
   ```
   git tag -f -a v2.5 -m "v2.5.1 — <subject>"
   git push -f origin v2.5
   ```
   (Force-update of a shared tag is the **intended** mechanism here — the only place
   we rewrite a pushed ref. The slot is reused; `versions.json` already has `v2.5`,
   so no append.)
4. Deploy fires → rebuilds `/hrv/v2.5/` (and `/hrv/` if v2.5 is official).

### New minor release (e.g. 2.5.x → 2.6.0) — new slot, NEW tag
1. Bump `package.json` to `2.6.0`. Merge to `main`. Sync locally.
2. Create and push a new annotated tag:
   ```
   git tag -a v2.6 -m "v2.6 — <subject>"
   git push origin v2.6
   ```
3. Deploy fires → builds `/hrv/v2.6/`; `append-versions-json` adds `v2.6` to
   `versions.json` on `main` (commit-back). It is **not** official yet.

### Promote a version to official (serve it at root `/hrv/`)
Because `read-manifest` reads `versions.json` from the **triggering tag's** tree, the
tag must point at a commit where `official` is already set:
1. Edit `versions.json` `official` → `vX.Y` on `main` (commit
   `chore(release): set vX.Y as official`). Sync locally.
2. Move/create the `vX.Y` tag at that commit and push (force-push if moving an
   existing slot) → `build-root` rebuilds root from the new official.
   - Alternative for an already-tagged version whose tag lacks the change: re-tag it
     at the updated commit, or run `workflow_dispatch` (dispatch reads `versions.json`
     from `main`, so the official edit on `main` takes effect at root).

## Verify a deploy
```
gh run list --workflow=deploy.yml --limit 3
gh run view <run-id>
curl -sI https://lucindo.github.io/hrv/        # root → official version
curl -sI https://lucindo.github.io/hrv/v2.5/   # the version subpath
```
All 7 jobs green = done. Each `index.html`'s asset paths must match its subpath
(root → `/hrv/assets/`, v2.5 → `/hrv/v2.5/assets/`); a mismatch means the `--base`
override didn't get plumbed into that build. Known non-blocking annotation: Node-20
action deprecation warnings (`actions/checkout@v4` etc.) — cosmetic, not a failure.

## Gotchas & one-time setup

- **Full-replace each deploy.** Only what gets assembled survives on the live site:
  root (official) + the `build-archives` matrix (`v1.5`) + the pushed current tag.
  A `vX.Y` subpath not in the matrix and not the current push **disappears**. To keep
  an old version reachable, add its tag to the `build-archives` matrix.
- **The app does not read `versions.json`** — there's no in-app version switcher; it
  only drives the workflow (root official + the version list).
- **Pages environment must allow `v*` tag deploys.** The `github-pages` environment
  uses a custom branch/tag policy; if tag deploys ever start failing at the deploy
  step, re-add the tag policy:
  ```
  gh api -X POST repos/lucindo/hrv/environments/github-pages/deployment-branch-policies \
    -f name='v*' -f type='tag'
  ```
- **Never hand-edit `versions.json.versions[]`** — `append-versions-json` owns it.
  `official` is never auto-changed; edit it by hand to promote (see procedure above).
- **`workflow_dispatch` skips `build-current`** (no pushed tag) and reads
  `versions.json` from `main`. Good for re-deploying root after an `official` edit;
  it will NOT (re)publish a version subpath.
- **`package-lock.json`'s own `version` field is intentionally left stale** — it sits
  at `2.3.3` and has NOT tracked `package.json` through 2.4→2.7. `npm ci` validates the
  **dependency tree** against `package.json`'s ranges, not the project's root `version`,
  so the drift is harmless (every release since 2.3 deployed fine). We therefore do
  **not** bump it on a version-only release. **Reminder for next time a dependency
  changes:** regenerating the lockfile (`npm install` / `npm i <pkg>`) will rewrite that
  field to the then-current `package.json.version` — let it, and include it in the same
  commit. Don't hand-sync it on its own otherwise.

## Desktop releases (Pake)

Native desktop apps (macOS universal `.dmg`, Windows x64 `.msi`) build and release
**independently** of the web deploy above. Source of truth:
`.github/workflows/desktop.yml`. Decisions: `DECISIONS.md` DA1–DA10.

- **Separate trigger:** `push` of a `desktop-v*` tag (plus `workflow_dispatch` for
  test runs). The `desktop-` prefix can't match the web `v*` trigger, so the two
  pipelines never cross — a desktop release does **not** touch Pages, `versions.json`,
  or `main`.
- **Tag form is full SemVer** (`desktop-v2.5.1`, matching `package.json.version`) and
  every release is a **fresh tag** — no slot-reuse / tag-moving like the web `vX.Y`.
- **What it does:** matrix-builds mac (`--multi-arch` universal) + win via pinned
  `pake-cli`, wrapping the live `https://lucindo.github.io/hrv/`. Installers are
  renamed `HRV-Breathing-<version>-{macos-universal.dmg,windows-x64.msi}` and
  attached to a GitHub Release on the tag.
- **The wrapper loads the live URL** — installed apps auto-update their web content,
  so desktop releases are rare: cut one only when wrapper config changes (icon,
  window, name, pake/Tauri bump), not on every web release.
- **Unsigned builds** — first-launch Gatekeeper/SmartScreen workaround lives in the
  README + the release notes (DA4); no code signing.

### Cut a desktop release
1. From `main` (the workflow must be on the default branch, else `workflow_dispatch`
   404s and a tag must point at a commit that has `desktop.yml`):
   ```
   git tag desktop-v<X.Y.Z>      # == package.json.version
   git push origin desktop-v<X.Y.Z>
   ```
2. The run builds both legs and publishes the Release. Verify:
   ```
   gh run list --workflow=desktop.yml --limit 3
   gh release view desktop-v<X.Y.Z> --json assets --jq '.assets[].name'
   curl -sI -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
     https://github.com/lucindo/hrv/releases/latest
   ```
   Three green jobs (`macos-universal`, `windows-x64`, `release`) + both assets
   attached + `releases/latest` → the new tag = done.
