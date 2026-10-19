import { filterEntries } from './fuzzy.js';

/**
 * Palette actions (Home, Browse pull requests, Diff against ref…). They are
 * ordinary palette entries scored by the same fuzzy matcher as repos, PRs and
 * worktrees: against their title plus a few `keywords`, with the title
 * highlighted.
 */

const base = { prState: '', hasWorktree: false, stale: false, active: false };

export const HOME_ACTION = Object.freeze({
  ...base, kind: 'home', id: 'home:', title: 'Home', subtitle: 'Browse all repos, PRs and worktrees',
  keywords: 'workspaces',
});

export const BROWSE_ACTION = Object.freeze({
  ...base, kind: 'browse', id: 'browse:prs', title: 'Browse pull requests', subtitle: 'Search PRs of this repo',
  keywords: 'prs',
});

export const COMPARE_ACTION = Object.freeze({
  ...base, kind: 'compare', id: 'compare:', title: 'Diff against ref…',
  subtitle: 'Compare the working tree with a branch, tag or commit', keywords: 'compare',
});

/**
 * Normal-mode results: actions and workspace entries, fuzzy-filtered by one
 * query. An empty query lists the actions first; otherwise everything is
 * ranked by score, actions winning ties.
 *
 * @template T
 * @param {object[]} actions
 * @param {T[]} entries
 * @param {string} query
 * @param {number} [limit]
 */
export function paletteItems(actions, entries, query, limit = Infinity) {
  const acts = filterEntries(actions, query);
  const rest = filterEntries(entries, query, limit);

  if (!(query ?? '').trim()) return [...acts, ...rest].slice(0, limit + acts.length);

  const out = [];
  let i = 0;
  let j = 0;

  while (i < acts.length || j < rest.length) {
    if (j >= rest.length || (i < acts.length && acts[i].score >= rest[j].score)) out.push(acts[i++]);
    else out.push(rest[j++]);
  }

  return out.slice(0, limit);
}
