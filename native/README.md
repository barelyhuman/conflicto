# Conflicto (native)

Rust + **GPUI** rewrite of Conflicto. See [`../SPEC.md`](../SPEC.md).

## Develop

```bash
cd native
cargo run -p conflicto
```

Requires `git` on PATH.

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

## TODO 

- [ ] Git 
    - [ ] Ability to switch branches 
    - [ ] Make commits 
    - [ ] Visualise the history graph
    - [ ] Connect to Github 
        - [ ] Ability to view a github PR
- [ ] File/Diff Viewer 
    - [ ] Ability to veritical scroll while keeping the line number sticky 
    - [ ] Multi-cursor selection for edits 
    - [ ] Blinking cursor
    - [ ] LSP
- [ ] Keyboard
    - [ ] Basic Ctrl/CMD+C,Ctrl/CMD+V,Ctrl/CMD+A doesn't work in editors today
    - [ ] Ability to quit the app with CMD+Q (Alt+f4)
    - [ ] A ctrl/cmd+P for showing all possible options 
