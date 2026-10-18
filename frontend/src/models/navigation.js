import { revealLine as defaultReveal } from './editorRegistry.js';

/**
 * Narrow "go to code" seam. Anything that wants to show a file (terminal
 * links, palette, search, LSP goto-definition, review comments) calls
 * `openFileAt` / `openDiff`. The implementation below sits on the editor tabs.
 */

const hasLineNumber = (line) => Number.isFinite(line) && line >= 1;

/**
 * @param {{
 *   tabs: InstanceType<typeof import('./tabs.js').TabsModel>,
 *   workingTree: InstanceType<typeof import('./workingTree.js').WorkingTreeModel>,
 *   activePR: import('@preact/signals-core').ReadonlySignal<number|null>,
 *   isPRFile?: (path: string) => boolean,
 *   reveal?: typeof defaultReveal,
 * }} deps
 * @returns {{
 *   openFileAt: (path: string, line?: number | null, col?: number | null) => boolean,
 *   openDiff: (path: string, mode?: import('./tabs.js').DiffMode, opts?: { preview?: boolean }) => boolean,
 * }}
 */
export function createNavigator({
  tabs,
  workingTree,
  activePR,
  isPRFile = () => false,
  reveal = defaultReveal,
}) {
  function openDiff(path, mode = 'working', { preview = true } = {}) {
    if (!path) return false;

    return tabs.open({ kind: 'diff', path, mode, preview }) != null;
  }

  function openFile(path, line, col) {
    const tab = tabs.open({ kind: 'file', path, preview: false });

    if (!tab) return false;

    if (hasLineNumber(line)) {
      reveal(tab.id, line, hasLineNumber(col) ? col : 1, tabs.currentScope());
    }

    return true;
  }

  function openFileAt(path, line = null, col = null) {
    if (!path) return false;

    const hasLine = hasLineNumber(line);

    // PR review shows the PR's diff for files that are part of it; anything
    // else exists on disk in the worktree and opens as source.
    if (activePR.peek() != null) {
      // A line target (goto-def, search hit, terminal link) needs the file tab to reveal it.
      return isPRFile(path) && line == null ? openDiff(path, 'pr', { preview: false }) : openFile(path, line, col);
    }

    const inList = (list) => list.peek().some((f) => f.path === path);

    if (!hasLine) {
      if (inList(workingTree.conflicts)) return openDiff(path, 'conflict', { preview: false });

      if (inList(workingTree.unstaged)) return openDiff(path, 'working', { preview: false });

      if (inList(workingTree.staged)) return openDiff(path, 'staged', { preview: false });
    }

    return openFile(path, line, col);
  }

  return { openFileAt, openDiff };
}

/** @type {ReturnType<typeof createNavigator> | null} */
let navigator = null;

/** App root registers the live implementation; returns an unregister fn. */
export function registerNavigator(impl) {
  navigator = impl;

  return () => {
    if (navigator === impl) navigator = null;
  };
}

/**
 * Open `path` (repo-relative, active worktree) and reveal `line`/`col` (1-based).
 * Changed file without a line opens its diff; otherwise an editable file tab.
 * @returns {boolean} whether something was opened
 */
export function openFileAt(path, line = null, col = null) {
  return navigator ? navigator.openFileAt(path, line, col) : false;
}

/**
 * Open the diff of `path` in the given mode.
 * @returns {boolean}
 */
export function openDiff(path, mode = 'working', opts) {
  return navigator ? navigator.openDiff(path, mode, opts) : false;
}
