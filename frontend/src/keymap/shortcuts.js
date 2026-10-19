/**
 * Documentation data for every app-level keyboard shortcut.
 *
 * This list describes the shortcuts; it does NOT wire them. The handlers live
 * where they always did (app.jsx, lsp/useCodeShortcuts.js, components/...).
 * When you add or change a shortcut, update this file too.
 *
 * Native text-editing keys (Cmd/Ctrl+C/V/X, arrows, word movement in inputs)
 * are not listed. CodeMirror's stock keymap is only partly listed, for the
 * bindings the editor actually surfaces.
 *
 * Scope: where the shortcut is live.
 *   global   fires from anywhere in the app
 *   editor   code / file tabs
 *   diff     the changes / commit panel
 *   review   pending-review comment composer
 *   search   the global search panel
 *   terminal terminal dock
 *   home     home screen
 *   palette  command palette
 *
 * `global` overlaps every scope; two other scopes overlap only when equal.
 * `mac` / `other` may be null when a platform has no such binding.
 *
 * @type {ReadonlyArray<{ id: string, mac: string | null, other: string | null, description: string, scope: 'global' | 'editor' | 'diff' | 'review' | 'search' | 'terminal' | 'home' | 'palette' }>}
 */
export const SHORTCUTS = Object.freeze([
  // Global
  { id: 'palette.toggle', mac: '⌘K', other: 'Ctrl+K', description: 'Open command palette (repos, PRs, worktrees)', scope: 'global' },
  { id: 'home.toggle', mac: '⌘⇧H', other: 'Ctrl+Shift+H', description: 'Toggle home screen', scope: 'global' },
  { id: 'prefs.open', mac: '⌘,', other: 'Ctrl+,', description: 'Preferences', scope: 'global' },
  { id: 'terminal.toggle', mac: '⌃`', other: 'Ctrl+`', description: 'Show or hide terminal dock', scope: 'global' },
  { id: 'search.open', mac: '⌘⇧F', other: 'Ctrl+Shift+F', description: 'Global search (seeds from selection)', scope: 'global' },
  { id: 'app.reload', mac: '⌘R', other: 'Ctrl+R', description: 'Reload (refresh current workspace)', scope: 'global' },
  { id: 'app.fullscreen', mac: '⌃⌘F', other: 'Ctrl+F', description: 'Toggle full screen', scope: 'global' },
  { id: 'app.quit', mac: '⌘Q', other: null, description: 'Quit (macOS app menu)', scope: 'global' },

  // Editor: tabs and code navigation
  { id: 'tab.close', mac: '⌘W', other: 'Ctrl+W', description: 'Close active tab', scope: 'editor' },
  { id: 'tab.reopen', mac: '⌘⇧T', other: 'Ctrl+Shift+T', description: 'Reopen closed tab', scope: 'editor' },
  { id: 'tab.mru', mac: '⌃Tab', other: 'Ctrl+Tab', description: 'Cycle recent tabs (add ⇧ to go backwards)', scope: 'editor' },
  { id: 'tab.select', mac: '⌘1–9', other: 'Ctrl+1–9', description: 'Select tab by position (9 = last)', scope: 'editor' },
  { id: 'tab.step', mac: '⌘⌥←/→', other: 'Ctrl+Alt+←/→', description: 'Previous / next tab', scope: 'editor' },
  { id: 'code.back', mac: '⌃-', other: 'Alt+←', description: 'Code navigation back', scope: 'editor' },
  { id: 'code.forward', mac: '⌃⇧-', other: 'Alt+→', description: 'Code navigation forward', scope: 'editor' },
  { id: 'file.save', mac: '⌘S', other: 'Ctrl+S', description: 'Save file tab', scope: 'editor' },
  { id: 'editor.definition', mac: 'F12', other: 'F12', description: 'Go to definition', scope: 'editor' },
  { id: 'editor.references', mac: '⇧F12', other: 'Shift+F12', description: 'Find references', scope: 'editor' },
  { id: 'editor.gotoClick', mac: '⌘-click', other: 'Ctrl+click', description: 'Go to definition (mouse)', scope: 'editor' },

  // Editor: text
  { id: 'editor.find', mac: '⌘F', other: 'Ctrl+F', description: 'Find in file', scope: 'editor' },
  { id: 'editor.findNext', mac: 'F3', other: 'F3', description: 'Find next (⇧ for previous)', scope: 'editor' },
  { id: 'editor.gotoLine', mac: '⌘G', other: 'Ctrl+G', description: 'Go to line', scope: 'editor' },
  { id: 'editor.selectNext', mac: '⌘D', other: 'Ctrl+D', description: 'Select next occurrence', scope: 'editor' },
  { id: 'editor.selectAllOcc', mac: '⌘⇧L', other: 'Ctrl+Shift+L', description: 'Select all occurrences', scope: 'editor' },
  { id: 'editor.undo', mac: '⌘Z', other: 'Ctrl+Z', description: 'Undo', scope: 'editor' },
  { id: 'editor.redo', mac: '⌘⇧Z', other: 'Ctrl+Y', description: 'Redo', scope: 'editor' },
  { id: 'editor.toggleComment', mac: '⌘/', other: 'Ctrl+/', description: 'Toggle line comment', scope: 'editor' },
  { id: 'editor.indent', mac: '⌘]', other: 'Ctrl+]', description: 'Indent (⌘[ / Ctrl+[ outdents)', scope: 'editor' },
  { id: 'editor.indentTab', mac: 'Tab', other: 'Tab', description: 'Indent selection (⇧Tab outdents)', scope: 'editor' },
  { id: 'editor.moveLine', mac: '⌥↑/↓', other: 'Alt+↑/↓', description: 'Move line up / down', scope: 'editor' },
  { id: 'editor.copyLine', mac: '⇧⌥↑/↓', other: 'Shift+Alt+↑/↓', description: 'Copy line up / down', scope: 'editor' },
  { id: 'editor.deleteLine', mac: '⇧⌘K', other: 'Ctrl+Shift+K', description: 'Delete line', scope: 'editor' },
  { id: 'editor.blankLine', mac: '⌘↵', other: 'Ctrl+Enter', description: 'Insert blank line below', scope: 'editor' },
  { id: 'editor.selectParent', mac: '⌘I', other: 'Ctrl+I', description: 'Expand selection to syntax parent', scope: 'editor' },
  { id: 'editor.cursorAbove', mac: '⌥⌘↑/↓', other: 'Ctrl+Alt+↑/↓', description: 'Add cursor above / below', scope: 'editor' },

  // Diff / changes panel
  { id: 'diff.commit', mac: '⌘↵', other: 'Ctrl+Enter', description: 'Commit (from commit message box)', scope: 'diff' },

  // Review (pending comments)
  { id: 'review.comment', mac: '⌘⇧M', other: 'Ctrl+Shift+M', description: 'Comment on selected lines', scope: 'review' },
  { id: 'review.paste', mac: '⌘⇧V', other: 'Ctrl+Shift+V', description: 'Attach comment from clipboard', scope: 'review' },
  { id: 'pr.prevFile', mac: '⌥↑', other: 'Alt+↑', description: 'Previous changed file (PR tab, Files view)', scope: 'review' },
  { id: 'pr.nextFile', mac: '⌥↓', other: 'Alt+↓', description: 'Next changed file (PR tab, Files view)', scope: 'review' },
  { id: 'review.add', mac: '⌘↵', other: 'Ctrl+Enter', description: 'Add comment to pending review', scope: 'review' },
  { id: 'review.cancel', mac: 'Esc', other: 'Esc', description: 'Close comment composer', scope: 'review' },

  // Search panel
  { id: 'search.case', mac: '⌥⌘C', other: 'Alt+C', description: 'Toggle match case', scope: 'search' },
  { id: 'search.word', mac: '⌥⌘W', other: 'Alt+W', description: 'Toggle whole word', scope: 'search' },
  { id: 'search.regex', mac: '⌥⌘R', other: 'Alt+R', description: 'Toggle regex', scope: 'search' },
  { id: 'search.run', mac: '↵', other: '↵', description: 'Run search (from query field)', scope: 'search' },
  { id: 'search.results', mac: '↓', other: '↓', description: 'Move focus into results', scope: 'search' },
  { id: 'search.blur', mac: 'Esc', other: 'Esc', description: 'Leave search field', scope: 'search' },

  // Terminal
  { id: 'terminal.split', mac: '⌘\\', other: 'Ctrl+\\', description: 'Split terminal right', scope: 'terminal' },
  { id: 'terminal.newTab', mac: '⌃⇧`', other: 'Ctrl+Shift+`', description: 'New terminal tab', scope: 'terminal' },
  { id: 'terminal.newline', mac: '⇧↵', other: 'Shift+Enter', description: 'Insert newline without submitting', scope: 'terminal' },
  { id: 'terminal.lf', mac: '⌃J', other: 'Ctrl+J', description: 'Insert newline (LF)', scope: 'terminal' },
  { id: 'terminal.openLink', mac: '⌘-click', other: 'Ctrl+click', description: 'Open file:line or URL from output', scope: 'terminal' },

  // Home screen
  { id: 'home.navigate', mac: '↑ ↓ ⌃N ⌃P', other: '↑ ↓ Ctrl+N Ctrl+P', description: 'Move selection', scope: 'home' },
  { id: 'home.zone', mac: 'Tab', other: 'Tab', description: 'Switch between repos and list', scope: 'home' },
  { id: 'home.open', mac: '↵', other: '↵', description: 'Open selected entry', scope: 'home' },
  { id: 'home.close', mac: 'Esc', other: 'Esc', description: 'Clear query, then close home', scope: 'home' },

  // Command palette
  { id: 'palette.navigate', mac: '↑ ↓ ⌃N ⌃P', other: '↑ ↓ Ctrl+N Ctrl+P', description: 'Move selection', scope: 'palette' },
  { id: 'palette.open', mac: '↵', other: '↵', description: 'Open selected entry', scope: 'palette' },
  { id: 'palette.close', mac: 'Esc', other: 'Esc', description: 'Close palette', scope: 'palette' },
  { id: 'palette.prMode', mac: '#', other: '#', description: 'Browse pull requests (# as first character)', scope: 'palette' },
  { id: 'palette.openLocally', mac: '⌘↵', other: 'Ctrl+Enter', description: 'Open PR locally (creates or links its worktree)', scope: 'palette' },
  { id: 'palette.prState', mac: '⌥⇥', other: 'Alt+Tab', description: 'Cycle PR state filter: open, merged, closed, all (PR mode)', scope: 'palette' },
]);
