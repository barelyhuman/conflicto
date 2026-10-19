# conflicto — Agent Notes

Wails v2 desktop app: Go backend + Preact frontend. Alpha.

## Build & Dev

- **Entry to all builds**: `mise.toml`. Do not call `wails` or `vite` directly unless you know why.
- `mise run dev` — Wails dev mode with live reload (builds icon first).
- `mise run build` — Local debug binary.
- `mise run build:production` — Stripped release binary (`-ldflags="-w -s" -trimpath`).
- `mise run icon` — Syncs `resources/app-icon/conflicto.png` → `build/appicon.png`. Called automatically by the three targets above; Wails fails if the icon is missing.
- `mise run clean` — Removes `build/bin` and `frontend/dist`.
- `mise run setup` — First-time setup: clean, icon, `pnpm install`, frontend build, `go mod tidy`.

Toolchain: `mise install` (Go, Node, pnpm versions pinned in `mise.toml`).

## Frontend (Preact, not React)

- **Framework**: Preact 10 + Vite. `vite.config.js` aliases `react` → `preact/compat`.
- **Package manager**: `pnpm` only. `frontend/package.json` pins `"packageManager": "pnpm@10.33.4"`.
- **Dev server alone**: `mise run dev:frontend` (Vite only). **Has no Go backend** — use `mise run dev` for a working UI.
- **Build**: `mise run build:frontend` → `cd frontend && pnpm build`.

### Testing & Lint

- `mise run test:frontend` → Vitest (`environment: 'node'`, pattern `src/**/*.test.js`).
- `pnpm lint` in `frontend/` runs ESLint on `src`.
- `mise run test` runs **test:frontend → build:frontend → go test**. Order matters: Go tests need `frontend/dist` to exist because the binary embeds it (`//go:embed all:frontend/dist`).

### E2E (Playwright)

- `mise run test:e2e` — Playwright (Chromium) against the **real Go backend**. `wails dev` also serves the app at `localhost:34115`, and a browser tab there gets the real `window.go` bindings over `/wails/ipc`. Playwright's `webServer` starts it via `mise run dev:e2e` (reuses a running one locally).
- Specs live in `frontend/e2e/` (not `src/`, so Vitest ignores them). `fixtures.js` gives each test a throwaway git repo (`repo`) and a page with it opened (`app`, via `SwitchProject`). Assert on the repo state with `repo.git(...)`.
- Not covered: the native webview (WKWebView), native dialogs, window chrome, menus. `wails dev` still opens a native window (needs a display; CI uses `xvfb-run`).
- `wails dev` flips file modes on `frontend/src/wailsjs/runtime/*`; `git checkout` them if they show as modified.

### Preact Signals — Critical

Signals are the primary state layer. The repo includes local OpenCode skills under `.agents/skills/` and `.claude/skills/` for signal correctness.

- **Never** read `signal.value` in a component body to drive JSX conditionals, text nodes, or attributes. This eagerly unwraps and re-renders the whole component.
- Use `<Show when={signal}>` from `@preact/signals/utils` for conditional rendering.
- Pass signals directly to DOM props (e.g., `<input value={name} />`) — Preact handles the binding.
- Use `useComputed(() => ...)` for derivations, then render the computed signal directly.
- ESLint enforces strict signal rules (`signals/no-signal-write-in-computed: error`, `no-value-after-await: error`, `no-signal-in-component-body: error`, `no-conditional-value-read: error`).

## Backend (Go)

- **Go version**: 1.26+ (see `go.mod`).
- **Wails binding**: Any exported method on the `App` struct (`app.go`) is automatically bound to JS as `window.go.main.App.MethodName`. Private helpers stay lowercase and are not callable from the frontend.
- **Events**: Go emits via `runtime.EventsEmit`; frontend subscribes via `window.runtime.EventsOn`. See `frontend/src/wails.js` for the canonical event map.
- **Platform files**: `macos_window_darwin.go` / `macos_window_stub.go` — macOS-specific window chrome (transparent webview, vibrancy, traffic-light positioning).
- **Workspace index** (`workspace_index.go`): builds the palette/home list of repos, PRs and worktrees. Cached `gh` data lives in `~/.config/conflicto/workspace-index.json` and refreshes in the background. PR↔worktree mapping is stored in git config as `branch.<b>.conflicto-pr`; stale = PR merged/closed.
- **Review drafts** (`review.go`): pending review comments persist to `~/.config/conflicto/review_drafts.json`, keyed by `<mainRepoPath>#<prNumber>` so a PR worktree and the main checkout share drafts. Submission posts all drafts as one review.
- **LSP** (`lsp.go`): the transport contract is documented at the top of the file. The backend is a generic JSON-RPC bridge plus process lifecycle. The frontend owns protocol semantics; the backend never sends `initialize`. Only the active worktree's servers run.
- **Compare** (`compare.go`): diffs the active worktree's working tree (incl. untracked) against any ref, directly or from the merge base of HEAD and the ref. `GetCompareFiles` resolves the ref to `baseSHA`; patch/content calls take that SHA so the list and patches stay consistent.
- **Search** (`search.go`): `SearchText` uses ripgrep when it is on PATH and falls back to `git grep`. It backs the LSP goto/references text fallback; there is no global search UI for now.

## Frontend architecture notes

- **Editor tabs** (`models/tabs.js`): per-worktree tab set, kinds `diff`, `file`, `pr` and `compare`. Identity is kind + path (`compare:<ref>`, or `compare:<ref>...` for merge base).
- **Editor extension points** (`models/editorRegistry.js`): `registerEditorExtension` adds CodeMirror extensions to every file editor. `getView` and `revealLine` address live views. Keep CodeMirror imports out of this module.
- **Navigation seam** (`models/navigation.js`): `openFileAt` / `openDiff` are the only way to jump to code. Terminal links, palette, LSP goto/references and review comments all go through it. Do not reveal lines directly.
- **LSP client** (`frontend/src/lsp/`): `client.js` is the JSON-RPC client and `session.js` owns per-server state (`idle | starting | indexing | ready | unavailable | error`). `codeNav.js` provides goto/references with the ripgrep fallback. The CodeMirror wiring lives in `components/tabs/cm/lsp.js`.
- **Terminal scopes** (`components/terminal/terminalStore.js`): panes are keyed by project/worktree path. Switching scope swaps the visible panes; other scopes stay mounted so PTYs and scrollback survive.
- **Keyboard shortcuts** (`keymap/shortcuts.js`): documentation data that feeds Preferences → Shortcuts. It does not wire handlers. Keep it updated when you add or change a shortcut; `shortcuts.test.js` fails on unintended clashes.
- **Generated bindings**: `frontend/src/wailsjs/go/` is tracked. Regenerate after changing exported `App` methods or their types with `go run github.com/wailsapp/wails/v2/cmd/wails generate module`.

## Runtime Dependencies

- `git` — Required for all repo operations.
- `gh` (GitHub CLI) — Required for PR features (list, checkout, comments, create). Diff viewing and local git ops work without it.
- `rg` (ripgrep) — Optional. Code-navigation text fallback; `git grep` is used when absent.
- Language servers — Optional, per language: `gopls`, `typescript-language-server`, `pyright-langserver`, `rust-analyzer`. Missing ones show an install hint.

## CI

- `.github/workflows/ci.yml` runs two jobs:
  1. **Go tests**: installs pnpm/Node, runs `pnpm install --frozen-lockfile && pnpm build` in `frontend/`, then `go test ./...`.
  2. **Frontend tests**: `pnpm install --frozen-lockfile && pnpm test`.
- CI uses pnpm `10.34.5` and Node `22`.
- `.github/workflows/nightly-macos.yml` — nightly unsigned macOS arm64 + amd64 builds:
  - Skip-if-unchanged via latest `nightly-YYYY.MM.DD` tag (no macOS runners when `main` is unchanged).
  - Uses `mise run build:production:mac` (`install:frontend` → `build:frontend` → `icon` → wails).
  - Publishes date-stamped prereleases (`nightly-2026.09.01`) with both arch zips.
- `.github/workflows/nightly-linux.yml` — nightly unsigned Linux AppImages (x86_64 + aarch64):
  - Shares the same `nightly-YYYY.MM.DD` release as `nightly-macos.yml` (cron offset 23:30 UTC; both workflows upload to it, neither deletes it).
  - Runs `mise run build:production` on `ubuntu-24.04` / `ubuntu-24.04-arm`, then packages via pinned linuxdeploy + `linuxdeploy-plugin-gtk` (both pinned; `--appimage-extract-and-run`, no FUSE needed on the runner).
  - AppImage assets: `conflicto-linux-x86_64.AppImage` / `conflicto-linux-aarch64.AppImage`; require glibc ≥ 2.39 and `webkit2gtk 4.1` at runtime (helpers resolve from the system's `PKGLIBEXECDIR`, so webkit is not fully bundleable).
