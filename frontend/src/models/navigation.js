import { revealLine as defaultReveal } from './editorRegistry.js';
import { api as defaultApi } from '../wails.js';
import { prTabs as defaultPRTabs } from './prTab.js';

/**
 * Narrow "go to code" seam. Anything that wants to show a file (terminal
 * links, palette, search, LSP goto-definition, review comments) calls
 * `openFileAt` / `openDiff` / `openPR`. The implementation below sits on the editor tabs.
 */

const hasLineNumber = (line) => Number.isFinite(line) && line >= 1;

/**
 * @param {{
 *   tabs: InstanceType<typeof import('./tabs.js').TabsModel>,
 *   workingTree: InstanceType<typeof import('./workingTree.js').WorkingTreeModel>,
 *   prTabs?: ReturnType<typeof import('./prTab.js').createPRTabRegistry>,
 *   api?: { openPRLocally: (number: number) => Promise<string> },
 *   onError?: (title: string, message: string) => void,
 *   reveal?: typeof defaultReveal,
 * }} deps
 * @returns {{
 *   openFileAt: (path: string, line?: number | null, col?: number | null) => boolean,
 *   openDiff: (path: string, mode?: import('./tabs.js').DiffMode, opts?: { preview?: boolean }) => boolean,
 *   openPR: (number: number, opts?: { locally?: boolean }) => Promise<boolean>,
 *   openPRLocally: (number: number) => Promise<boolean>,
 * }}
 */
export function createNavigator({
  tabs,
  workingTree,
  prTabs = defaultPRTabs,
  api = defaultApi,
  onError,
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

    const inList = (list) => list.peek().some((f) => f.path === path);

    if (!hasLine) {
      if (inList(workingTree.conflicts)) return openDiff(path, 'conflict', { preview: false });

      if (inList(workingTree.unstaged)) return openDiff(path, 'working', { preview: false });

      if (inList(workingTree.staged)) return openDiff(path, 'staged', { preview: false });
    }

    return openFile(path, line, col);
  }

  /**
   * Create or link the PR's worktree, switch to it, and move the PR tab from
   * the scope it was opened in into the worktree's tab set.
   */
  async function openPRLocally(number) {
    const origin = tabs.currentScope();
    const tab = tabs.open({ kind: 'pr', number });

    if (!tab) return false;
    let path;

    try {
      path = await api.openPRLocally(number);
    } catch (err) {
      onError?.('Open locally failed', err?.message ?? String(err));

      return false;
    }

    if (!path) return false;
    // Re-key the model first so the view that mounts in the new scope finds it.
    prTabs.rekey(number, origin, path)?.setWorktreePath(path);
    tabs.moveTab(tab.id, origin, path);
    // The backend also emits projectChanged; setScope is idempotent.
    tabs.setScope(path);

    return true;
  }

  /** Open or focus the PR tab in the current scope; `locally` also opens its worktree. */
  async function openPR(number, { locally = false } = {}) {
    const tab = tabs.open({ kind: 'pr', number });

    if (!tab) return false;

    return locally ? openPRLocally(number) : true;
  }

  return { openFileAt, openDiff, openPR, openPRLocally };
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

/**
 * Open (or focus) the PR tab for `number` in the current worktree; with
 * `locally`, also create/link its worktree and move the tab there.
 * @returns {Promise<boolean>}
 */
export function openPR(number, opts) {
  return navigator ? navigator.openPR(number, opts) : Promise.resolve(false);
}

/** "Open locally" / "Go to worktree" for an already open PR tab. @returns {Promise<boolean>} */
export function openPRLocally(number) {
  return navigator ? navigator.openPRLocally(number) : Promise.resolve(false);
}
