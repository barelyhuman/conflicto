/**
 * Pure grouping logic for the home screen (same entries as the palette).
 */

/** Active first, then most recently updated. */
function byRecency(a, b) {
  if (a.active !== b.active) return a.active ? -1 : 1;

  return (b.updatedAt || '').localeCompare(a.updatedAt || '');
}

/**
 * Repos for the left column, sorted by name.
 *
 * @param {import('../../models/workspaceIndex.js').WorkspaceEntry[]} entries
 * @returns {{ repoPath: string, repoName: string, count: number }[]}
 */
export function listRepos(entries) {
  const repos = new Map();

  for (const e of entries) {
    if (!e.repoPath) continue;
    const r = repos.get(e.repoPath) ?? { repoPath: e.repoPath, repoName: e.repoName || e.repoPath, count: 0 };

    if (e.kind !== 'repo') r.count++;
    repos.set(e.repoPath, r);
  }

  return [...repos.values()].sort((a, b) => a.repoName.localeCompare(b.repoName));
}

/** Entries belonging to `repoPath` (all when empty). */
export function scopeToRepo(entries, repoPath) {
  return repoPath ? entries.filter((e) => e.repoPath === repoPath) : entries;
}

/**
 * Split entries into the home screen sections.
 * - open:  anything with a local path that isn't stale (main checkouts, worktrees, PRs with worktrees)
 * - prs:   PRs without a local worktree (remote only)
 * - stale: worktrees whose PR is merged/closed
 *
 * @param {import('../../models/workspaceIndex.js').WorkspaceEntry[]} entries
 */
export function groupEntries(entries) {
  const open = [];
  const prs = [];
  const stale = [];

  for (const e of entries) {
    if (e.stale) stale.push(e);
    else if (e.kind === 'pr' && !e.hasWorktree) prs.push(e);
    else if (e.path) open.push(e);
  }

  open.sort(byRecency);
  prs.sort(byRecency);
  stale.sort(byRecency);

  return { open, prs, stale };
}

/**
 * Sections as rows with navigable positions (`pos`) for keyboard selection.
 *
 * @param {import('../../models/workspaceIndex.js').WorkspaceEntry[]} entries
 */
export function buildSections(entries) {
  const g = groupEntries(entries);
  const defs = [
    ['open', 'Open workspaces', g.open],
    ['prs', 'Pull requests', g.prs],
    ['stale', 'Stale worktrees', g.stale],
  ];
  const flat = [];
  const sections = [];

  for (const [key, title, list] of defs) {
    if (!list.length) continue;
    const items = list.map((entry) => {
      const item = { entry, indices: [], pos: flat.length };
      flat.push(item);

      return item;
    });
    sections.push({ key, title, items });
  }

  return { sections, flat };
}

/** "just now" / "12s ago" / "3m ago" / "2h ago". */
export function formatAgo(from, now) {
  if (!from) return 'never';
  const s = Math.max(0, Math.round((now - from) / 1000));

  if (s < 5) return 'just now';

  if (s < 60) return `${s}s ago`;

  if (s < 3600) return `${Math.floor(s / 60)}m ago`;

  return `${Math.floor(s / 3600)}h ago`;
}
