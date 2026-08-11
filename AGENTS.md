# conflicto — Agent Notes

Wails v2 desktop app: Go backend + Preact frontend. Alpha.

## Build & Dev

- **Entry to all builds**: `Makefile`. Do not call `wails` or `vite` directly unless you know why.
- `make dev` — Wails dev mode with live reload (builds icon first).
- `make build` — Local debug binary.
- `make build-production` — Stripped release binary (`-ldflags="-w -s" -trimpath`).
- `make icon` — Syncs `resources/app-icon/conflicto.png` → `build/appicon.png`. Called automatically by the three targets above; Wails fails if the icon is missing.
- `make clean` — Removes `build/bin` and `frontend/dist`.

## Frontend (Preact, not React)

- **Framework**: Preact 10 + Vite. `vite.config.js` aliases `react` → `preact/compat`.
- **Package manager**: `pnpm` only. `frontend/package.json` pins `"packageManager": "pnpm@10.33.4"`.
- **Dev server alone**: `make frontend-dev` (Vite only). **Has no Go backend** — use `make dev` for a working UI.
- **Build**: `make frontend-build` → `cd frontend && pnpm build`.

### Testing & Lint

- `make frontend-test` → Vitest (`environment: 'node'`, pattern `src/**/*.test.js`).
- `pnpm lint` in `frontend/` runs ESLint on `src`.
- `make test` runs **frontend-test → frontend-build → go test**. Order matters: Go tests need `frontend/dist` to exist because the binary embeds it (`//go:embed all:frontend/dist`).

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

## Runtime Dependencies

- `git` — Required for all repo operations.
- `gh` (GitHub CLI) — Required for PR features (list, checkout, comments, create). Diff viewing and local git ops work without it.

## CI

- `.github/workflows/ci.yml` runs two jobs:
  1. **Go tests**: installs pnpm/Node, runs `pnpm install --frozen-lockfile && pnpm build` in `frontend/`, then `go test ./...`.
  2. **Frontend tests**: `pnpm install --frozen-lockfile && pnpm test`.
- CI uses pnpm `10.34.5` and Node `22`.
