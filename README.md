# conflicto 

<p align="center">
<img src="./resources/docs/preview.png">
</p>
<p align="center">
  <span>Small on purpose. Sharp on every diff.</span>
</p>

## Quick install (macOS)

[Nightly builds](https://github.com/barelyhuman/conflicto/releases) are **unsigned and unnotarized** — macOS will warn on first launch. Download `conflicto-macos-arm64.zip` (Apple Silicon) or `conflicto-macos-amd64.zip` (Intel), unzip to `/Applications`, then:

```bash
xattr -cr /Applications/conflicto.app   # remove quarantine
open /Applications/conflicto.app        # first launch: right-click → Open if macOS still blocks
```

Nightlies are tagged by date (`nightly-2026.09.01`) and only publish when `main` has new commits since the previous nightly. [Build from source](#build-from-source)

> [!WARNING]
> 
> Alpha software, expects bugs 

## Prerequisites

- **[mise](https://mise.jdx.dev/)** — Installs and runs the pinned Go, Node, and pnpm versions from `mise.toml`. See [Setup](#setup) below.
- **GitHub CLI (`gh`)** — [Install gh](https://cli.github.com/), then authenticate:

  ```bash
  gh auth login
  ```

  PR listing, checkout, comments, and related GitHub features call `gh` at runtime. Diff viewing still works without it; GitHub integration does not.

Also required to build: a C/C++ toolchain for [Wails](https://wails.io/) (platform deps vary — see the Wails docs).

## Setup

Install mise, then trust and install the project toolchain:

```bash
curl https://mise.run | sh          # or: brew install mise
cd conflicto
mise trust                            # allow tasks/env from mise.toml
mise install                          # Go, Node, pnpm (versions pinned in mise.toml)
mise run setup                        # sync icon, install deps, build frontend
```

After setup, `mise run dev` starts Wails dev mode with live reload.

## Build from source

```bash
git clone https://github.com/barelyhuman/conflicto.git
cd conflicto
mise trust
mise install
mise run build:frontend
mise run build
```

That syncs the app icon and runs `wails build`. The binary lands under `build/bin/`.

Useful tasks (run with `mise run <task>`):

| Task | Description |
| --- | --- |
| `dev` | Wails dev mode (live reload) |
| `build` | Local debug binary |
| `build:production` | Production binary (`-ldflags="-w -s" -trimpath`) |
| `test` | Go + frontend tests |
| `test:frontend` | Frontend unit tests (Vitest) |
| `clean` | Remove build artifacts |
| `setup` | First-time setup (clean, icon, deps, frontend build) |

Frontend-only: `dev:frontend` / `build:frontend` (runs `pnpm` in `frontend/`). Vite alone has no Go backend — use `dev` for a working UI.

List all tasks: `mise tasks`

## Keybindings

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+,` | Preferences |
| `Escape` | Close Preferences |
| `Cmd/Ctrl+R` | Reload |
| `Cmd+Ctrl+F` (macOS) / `Ctrl+F` | Full Screen |
| `Cmd/Ctrl+W` | Close window |
| `Cmd/Ctrl+Enter` | Commit (from commit message field) |
| ``Cmd/Ctrl+` `` | Toggle terminal dock |
| ``Cmd/Ctrl+Shift+` `` | New terminal tab (opens dock if needed) |
| `Cmd/Ctrl+\\` | Split terminal right (dock open) |

On macOS, the Edit menu also provides the usual text-editing shortcuts (`Cmd+A/C/V/X/Z`).
