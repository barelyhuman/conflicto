# Conflicto — Native Spec (v1)

## Why

A simple local git differ should not ship Chromium (~300MB). Conflicto’s native rewrite targets a **small Rust binary** with the same job and a familiar layout. Personal tool; also a chance to learn Rust. No rush.

## Decisions

| Choice | Decision |
|--------|----------|
| Language | Rust |
| UI | egui + eframe (no webview) |
| Git | System `git` on PATH |
| Platforms | **macOS first**; portable crates (`rfd`, `dirs`, `eframe`) for Linux/Windows later |
| Aesthetics | Close enough to Electron (layout + tokens), not pixel-perfect |
| V1 | Diffs (editable when unstaged), graph, themes |
| Later | Terminal/PTY, watcher, branch switcher, GitHub PRs, updater |

Code lives under [`native/`](native/). Electron remains until the native app is useful.

## Footprint budget

| Metric | Target |
|--------|--------|
| Release artifact | ≤ 15–25 MB goal; ceiling ≪ 100 MB (**~10 MB** with tree-sitter builtins on macOS arm64) |
| Idle RSS | Tens of MB, not hundreds |
| Build | `lto = true`, `codegen-units = 1`, strip in release |

**Do not pull in:** browsers/WebViews, full unused syntax packs, debug symbols in release packages, libgit2 (use system git).

## V1 features

| Area | Behavior |
|------|----------|
| Repo | Open folder / path; recents (max 20); remember last repo |
| Changes | Staged + working tree; stage/unstage; status letters |
| Diff | Side-by-side / inline; **tree-sitter** syntax highlight; **unstaged WT pane is the file** (edit + ⌘S) |
| Graph | Sidebar accordion; ~80 commits; lane graph; commit files + blob diff |
| Themes | Ported packs + UI tokens on chrome, diff, and highlight palette |
| Prefs | `themeId`, `lastRepoPath` in platform config dir |
| Shortcuts | Open repo (⌘O), refresh (⌘R), save when dirty (⌘S) |

**Not in v1:** separate editor mode, embedded terminal, FS watcher, GitHub, updater, language extension loader.

### Editable unstaged diff

- **Never three editors** — max two panes; WT side is the file when unstaged.
- **Unstaged:** line-oriented editable diff widget (Equal/Insert rows) with red/green hunk chrome on both panes; ⌘S writes UTF-8; dirty indicator; refresh after save.
- **Staged** / **commit:** read-only highlighted panes with the same red/green hunk chrome.
- Built-in highlight langs: rust, typescript/tsx, javascript, python, json, css (else plaintext).
- Tree-sitter highlighting stays on glyphs; hunk tint is row background.

## Layout (close enough)

```
main (flex)                         | sidebar ~320px
toolbar (surface)                   | header + repo meta
diff stage (WT side editable)       | Changes | Graph accordion
                                    | (open section fills)
```

Window ~1280×800, min ~800×500. Flat surfaces (`bg` / `bg_sidebar` / `bg_surface`); no structural hairlines; control borders only.

## Data model

Mirror Electron types: `RepoInfo`, `ChangeEntry`, `FileDiff`, `CommitInfo`, `CommitFile`, `AppPreferences`, `ViewMode`, `RecentRepo`, `ThemeId`, `UiVars`.

## Architecture

```
conflicto (bin)     — egui shell, sidebar, diff/edit UI, shortcuts
conflicto_core      — git CLI, prefs/recents, themes, graph layout, file IO, tree-sitter highlight
```

Platform bits stay thin (`rfd`, `dirs`, eframe/winit). No `cfg(target_os)` in feature logic except tiny chrome helpers.

### Platform checklist (later Linux/Windows)

- Fonts (UI + monospace)
- Shortcuts: Meta on macOS, Ctrl elsewhere
- Folder dialog / config dir via portable crates
- Window decorations

## Theme packs

`pierre-dark`, `pierre-light`, `dark-plus`, `light-plus`, `rose-pine`, `rose-pine-moon`, `rose-pine-dawn` — derived UI vars from VS Code–style color maps (same semantics as Electron `deriveUiVars`).

## Roadmap (not v1)

- Terminal / PTY (layout hook reserved for bottom panel)
- Watcher architecture
- Branch switcher
- Ignore-whitespace diff option
- App updater
- GitHub PRs / comments / worktrees
- Prefs schema validation (Zod-equivalent)
- **Language extensions** (dynamic grammars via `LanguageRegistry::register` — dylib/sidecar packs)

## v1 done when

On macOS: open a repo, review/stage diffs, edit and save unstaged files in the diff view, browse the graph, switch themes — release artifact still ≪ Electron.
