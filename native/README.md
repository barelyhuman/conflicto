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

Observed release binary on macOS arm64: **~4.2 MB** (≪ Electron).

## Shortcuts

- ⌘/Ctrl+O — open repository
- ⌘/Ctrl+R — refresh
- ⌘/Ctrl+S — save unstaged edits
