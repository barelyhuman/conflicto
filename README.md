# Conflicto

A fast, VS Code-inspired desktop diff viewer. Point it at a git repo and inspect staged / unstaged file diffs in Monaco.

## Human TODO

- [ ] Git staged/unstaged/merged view 
    - [ ] Watcher Arch
        - [ ] Verify watching arch before doing anything 
    - [ ] Git graph
- [ ] History on the sidebar for all added / watching folders 
- [ ] Ability to connect to github to see PR's and check their diffs 
    - [ ] View / hide PR comments 
    - [ ] Ability to approve / merged / open the PR 
    - [ ] Open the PR in a worktree locally if needed
- [ ] Add options to see diff with whitespace disabled 
- [ ] A very simple terminal integration
- [ ] Better theme arch
    - [ ] Create an adaptive theme that uses the monaco themes to create the rest of the UI

## Agent TODO

- [ ] Git graph in the sidebar as an accordion

## Stack

- Electron + Vite
- Preact + `@preact/signals`
- Monaco DiffEditor
- System `git` via the Electron main process

## Develop

```bash
pnpm install
pnpm dev
```

Requires `git` on your PATH.

Dev launches Electron with:

- Chromium CDP: `http://127.0.0.1:9222`
- Node inspector: `http://127.0.0.1:9229`

Probe both:

```bash
pnpm cdp
```

If Electron boots but `import 'electron'` fails (API is a path string), check that `ELECTRON_RUN_AS_NODE` is unset — Cursor’s agent shell often sets it. `pnpm dev` clears it when spawning Electron.

## Shortcuts

- `⌘O` / `Ctrl+O` — open repository
- `⌘R` / `Ctrl+R` — refresh changes

