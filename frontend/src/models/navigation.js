/**
 * Narrow "go to code" seam. Anything that wants to show a file at a line
 * (terminal links today; palette / search / review comments later) calls
 * `openFileAt`. The implementation below targets today's single-selection UI;
 * the editor-tabs work can swap `createNavigator` without touching callers.
 */

/**
 * @param {{
 *   selection: InstanceType<typeof import('./selection.js').SelectionModel>,
 *   workingTree: InstanceType<typeof import('./workingTree.js').WorkingTreeModel>,
 *   isPRFile?: (path: string) => boolean,
 * }} deps
 * @returns {(path: string, line?: number | null, col?: number | null) => boolean}
 */
export function createNavigator({ selection, workingTree, isPRFile = () => false }) {
  return function openFileAt(path, line = null, _col = null) {
    if (!path) return false;

    const hasLine = Number.isFinite(line) && line >= 1;

    // PR mode shows the PR's diff; only files that are part of it can be opened.
    if (selection.activePR.peek() != null) {
      if (!isPRFile(path)) return false;
      selection.select(path, 'pr');

      return true;
    }

    const inList = (list) => list.peek().some((f) => f.path === path);

    if (inList(workingTree.conflicts)) {
      selection.select(path, 'conflict');

      return true;
    }

    const stagedOnly = inList(workingTree.staged) && !inList(workingTree.unstaged);

    // Staged-only files can't be edited in place: show their diff.
    if (stagedOnly) {
      selection.select(path, 'staged');

      return true;
    }

    const changed = inList(workingTree.unstaged);
    selection.select(path, 'unstaged');

    // Changed file without a line: the diff is the useful view.
    // Otherwise (clean file, or an explicit line) open the editor at the line.
    if (hasLine || !changed) selection.openEditorAtLine(hasLine ? line : 1);

    return true;
  };
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
 * Open `path` (repo-relative, active worktree) and reveal `line` (1-based).
 * `col` is accepted for forward compatibility and currently ignored.
 * @returns {boolean} whether something was opened
 */
export function openFileAt(path, line = null, col = null) {
  return navigator ? navigator(path, line, col) : false;
}
