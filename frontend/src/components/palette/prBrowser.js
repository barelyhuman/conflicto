/**
 * Pure logic for the command palette's PR browser mode (no Preact, no Wails).
 *
 * Entering PR mode: the query starts with `#` (the rest is the PR query), or the
 * "Browse pull requests" action is picked. Results are the cached open PRs of the
 * active repo (from the workspace index) merged with live `gh` search results.
 */

/** State filter values, in cycle order. */
export const PR_STATES = Object.freeze(['open', 'merged', 'closed', 'all']);

/** Next state filter (wraps around). Unknown states restart at the first one. */
export function nextPRState(state) {
  const i = PR_STATES.indexOf(state);

  return PR_STATES[(i + 1) % PR_STATES.length] ?? PR_STATES[0];
}

/**
 * Split raw palette input into mode and query. A leading `#` switches to PR mode;
 * the query is what follows it.
 *
 * @returns {{ mode: 'index' | 'prs', query: string }}
 */
export function parsePaletteInput(raw) {
  const value = raw ?? '';

  if (value.startsWith('#')) return { mode: 'prs', query: value.slice(1).trimStart() };

  return { mode: 'index', query: value };
}

/**
 * Parse a PR-mode query. `36` and `#36` both name PR 36; anything else is text.
 *
 * @returns {{ text: string, number: number | null }}
 */
export function parsePRQuery(query) {
  const text = (query ?? '').trim().replace(/^#/, '');
  const m = /^(\d+)$/.exec(text);

  return { text, number: m ? Number(m[1]) : null };
}

/** Superseded `searchPRs` calls reject with a "context canceled" error. */
export function isCancellation(err) {
  const msg = typeof err === 'string' ? err : err?.message ?? '';

  return /context canceled/i.test(msg);
}

/** Identity of one live search; a result is only shown when its key matches the current input. */
export function prSearchKey(state, text) {
  return `${state}\u0000${parsePRQuery(text).text.toLowerCase()}`;
}

/** Does a cached workspace PR entry belong to the state filter? The index only caches open PRs. */
export function matchesPRState(prState, state) {
  if (state === 'all') return true;

  const want = { open: 'OPEN', merged: 'MERGED', closed: 'CLOSED' }[state];

  return want !== undefined && (prState ?? '').toUpperCase() === want;
}

/** Badge text / class suffix: drafts show as "draft", otherwise the PR state. */
function badgeState(state, isDraft) {
  const s = (state ?? '').toUpperCase();

  return isDraft && s === 'OPEN' ? 'DRAFT' : s;
}

/**
 * Palette entry (WorkspaceRow shape) for a live `searchPRs` result.
 *
 * @param {{ number: number, title: string, author?: string, state?: string, isDraft?: boolean, headRef?: string, updatedAt?: string, worktreePath?: string }} pr
 * @param {string} repoPath active repo; the PR tab opens in the current repo
 */
export function prEntryFromSummary(pr, repoPath = '') {
  return {
    kind: 'pr',
    id: `pr:${repoPath}#${pr.number}`,
    title: `#${pr.number} ${pr.title ?? ''}`.trim(),
    subtitle: [pr.author ? `@${pr.author}` : '', pr.headRef ?? ''].filter(Boolean).join(' · '),
    repoPath,
    repoName: '',
    path: pr.worktreePath ?? '',
    prNumber: pr.number,
    prState: badgeState(pr.state, pr.isDraft),
    branch: pr.headRef ?? '',
    hasWorktree: Boolean(pr.worktreePath),
    stale: false,
    active: false,
    updatedAt: pr.updatedAt ?? '',
  };
}

/**
 * Palette entry for a cached workspace-index PR entry (kind `pr`), in PR-mode form.
 * The index subtitle is "<repo> · #n · @author"; the author is taken from it.
 */
export function prEntryFromWorkspace(entry) {
  const author = /@(\S+)/.exec(entry.subtitle ?? '')?.[1];

  return {
    ...entry,
    title: `#${entry.prNumber} ${entry.title ?? ''}`.trim(),
    subtitle: [author ? `@${author}` : '', entry.branch ?? ''].filter(Boolean).join(' · '),
    prState: badgeState(entry.prState, false),
  };
}

/**
 * Cached open PRs of one repo from the workspace index, as PR-mode entries.
 * Only `kind === 'pr'` entries whose repoPath matches are kept.
 */
export function cachedPREntries(indexEntries, repoPath, state = 'open') {
  if (!repoPath) return [];

  return (indexEntries ?? [])
    .filter((e) => e.kind === 'pr' && e.repoPath === repoPath && matchesPRState(e.prState, state))
    .map(prEntryFromWorkspace);
}

/** The active repo, from the index entry flagged `active` (repo, worktree or PR of it). */
export function activeRepo(indexEntries) {
  const active = (indexEntries ?? []).find((e) => e.active && e.repoPath);

  return { repoPath: active?.repoPath ?? '', repoName: active?.repoName ?? '' };
}

/**
 * Merge result items: live rows first (in their order), then cached rows whose
 * PR number is not already live. Each item is `{ entry, score, indices }` and
 * the dedupe key is `entry.prNumber`; the live item wins on a clash.
 */
export function mergePRItems(live, cached) {
  const seen = new Set();
  const out = [];

  for (const item of [...(live ?? []), ...(cached ?? [])]) {
    const n = item.entry.prNumber;

    if (seen.has(n)) continue;
    seen.add(n);
    out.push(item);
  }

  return out;
}
