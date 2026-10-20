/**
 * Menu items for the sidebar worktree picker (pure).
 */

/**
 * Shorten a filesystem path for display.
 * @param {string} path
 * @returns {string}
 */
export function shortenPath(path) {
  if (!path) return '';
  const parts = path.split('/');

  if (parts.length <= 3) return path;

  return `…/${parts.slice(-3).join('/')}`;
}

/**
 * Is this worktree the active one? currentPath is authoritative; isCurrent is
 * only a fallback before the project path is known.
 * @param {{ path: string, isCurrent: boolean }} wt
 * @param {string} currentPath
 */
export function isActiveWorktree(wt, currentPath) {
  return currentPath ? wt.path === currentPath : Boolean(wt.isCurrent);
}

/**
 * Stale label per worktree path, from workspace-index entries (worktree or PR
 * entries that carry a path).
 * @param {Array<{ kind: string, path?: string, stale?: boolean, prState?: string }>} indexEntries
 * @returns {Map<string, 'merged'|'closed'|'stale'>}
 */
export function staleByPath(indexEntries) {
  const out = new Map();

  for (const e of indexEntries ?? []) {
    if (!e.path || !e.stale || (e.kind !== 'worktree' && e.kind !== 'pr')) continue;
    const s = (e.prState ?? '').toLowerCase();
    out.set(e.path, s === 'merged' || s === 'closed' ? s : 'stale');
  }

  return out;
}

/**
 * @param {Array<{ path: string, branch: string, head: string, isMain: boolean, isCurrent: boolean }>} entries
 * @param {string} currentPath
 * @param {Array<object>} indexEntries workspace index entries
 */
export function buildWorktreeItems(entries, currentPath, indexEntries) {
  const stale = staleByPath(indexEntries);

  return entries.map((wt) => ({
    id: wt.path,
    path: wt.path,
    label: wt.branch || wt.head || 'detached',
    sublabel: shortenPath(wt.path),
    keywords: [wt.path],
    isMain: Boolean(wt.isMain),
    current: isActiveWorktree(wt, currentPath),
    stale: stale.get(wt.path) ?? null,
  }));
}
