# Conflicto (native)

Rust + **GPUI** rewrite of Conflicto. See [`../SPEC.md`](../SPEC.md).

## Develop

```bash
cd native
cargo run -p conflicto
```

Requires `git` on PATH. GitHub PR listing uses `gh` when available and authenticated.

On macOS, GPUI needs the Xcode Metal toolchain once:

```bash
xcodebuild -downloadComponent MetalToolchain
```

Release (size-optimized via workspace `profile.release`):

```bash
cargo build -p conflicto --release
ls -lh target/release/conflicto
```

## Syntax highlighting

Tree-sitter builtins (statically linked): **rust, typescript/tsx, javascript, python, json, css**. Other extensions render as plaintext until a language-extension loader ships.

Unstaged side-by-side: left = read-only hunk chrome; right = editable Equal/Insert rows with the same red/green fills (one `edit_buffer`, not a third editor).

## Shortcuts

- ⌘/Ctrl+O — open repository
- ⌘/Ctrl+R — refresh
- ⌘/Ctrl+S — save unstaged edits
- ⌘/Ctrl+\ — toggle side-by-side / inline
- ⌘/Ctrl+P — command palette
- ⌘/Ctrl+Enter — commit staged changes
- ⌘Q / Alt+F4 — quit
- ⌘/Ctrl+C / V / X / A — copy / paste / cut / select-all in editors
- Shift+wheel — horizontal scroll in the diff (line numbers stay sticky)
- Alt+click — add an extra caret in the editable diff

## TODO

- [x] Git
    - [x] Ability to switch branches
    - [x] Make commits
    - [x] Ability to push/pull/fetch
    - [x] Visualise the history graph
    - [x] Connect to Github
        - [x] Ability to view a github PR
- [x] File/Diff Viewer
    - [x] Ability to vertical scroll while keeping the line number sticky
    - [x] Multi-cursor selection for edits
    - [x] Blinking cursor
    - [ ] LSP *(scaffold only — `LspSession` tracks docs; no language-server process yet)*
- [x] Keyboard
    - [x] Basic Ctrl/CMD+C,Ctrl/CMD+V,Ctrl/CMD+A doesn't work in editors today
    - [x] Ability to quit the app with CMD+Q (Alt+f4)
    - [x] A ctrl/cmd+P for showing all possible options
