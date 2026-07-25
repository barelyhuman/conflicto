# Conflicto (native)

Rust + egui rewrite of Conflicto. See [`../SPEC.md`](../SPEC.md).

## Develop

```bash
cd native
cargo run -p conflicto
```

Requires `git` on PATH.

Release (size-optimized via workspace `profile.release`):

```bash
cargo build -p conflicto --release
ls -lh target/release/conflicto
```

## Syntax highlighting

Tree-sitter builtins (statically linked): **rust, typescript/tsx, javascript, python, json, css**. Other extensions render as plaintext until a language-extension loader ships.

Unstaged side-by-side: left = read-only hunk chrome; right = editable Equal/Insert rows with the same red/green fills (one `edit_buffer`, not a third editor).

Observed release binary on macOS arm64: **~10 MB** (with builtins; ≪ Electron).

## Shortcuts

- ⌘/Ctrl+O — open repository
- ⌘/Ctrl+R — refresh
- ⌘/Ctrl+S — save unstaged edits


## TODO 

- [ ] Migrate the sidebar to `ui_kit`
     - [ ] Sidebar container
     - [ ] File Entries 
     - [ ] File Actions 
     - [ ] Dropdown Container and Entries