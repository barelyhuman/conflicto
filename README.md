# conflicto 

<p align="center">
<img src="./resources/app-icon/conflicto.png" height="135">
</p>

The last git diff and github PR Reviewer tool you'll ever need. 

> [!NOTE]
> 
> Alpha software, expects bugs 

## Prerequisites

- **Go** — [Go 1.26+](https://go.dev/dl/) (see `go.mod`). Needed to compile the Wails backend and run `make` targets.
- **GitHub CLI (`gh`)** — [Install gh](https://cli.github.com/), then authenticate:

  ```bash
  gh auth login
  ```

  PR listing, checkout, comments, and related GitHub features call `gh` at runtime. Diff viewing still works without it; GitHub integration does not.

Also required to build: [pnpm](https://pnpm.io/), [Node.js](https://nodejs.org/), and a C/C++ toolchain for [Wails](https://wails.io/) (platform deps vary — see the Wails docs).

## Build from source

```bash
git clone https://github.com/barelyhuman/conflicto.git
cd conflicto
make frontend-build
make build
```

That syncs the app icon and runs `wails build`. The binary lands under `build/bin/`.

Useful targets:

| Command | Description |
| --- | --- |
| `make dev` | Wails dev mode (live reload) |
| `make build` | Local debug binary |
| `make build-production` | Production binary (`-ldflags="-w -s" -trimpath`) |
| `make test` | Go tests |
| `make clean` | Remove build artifacts |

Frontend-only: `make frontend-dev` / `make frontend-build` (runs `pnpm` in `frontend/`).
