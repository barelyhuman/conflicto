import { fuzzyMatch } from './fuzzy.js';

/**
 * Pure logic for the command palette's ref mode (no Preact, no Wails).
 *
 * Picking "Diff against ref…" lists the active worktree's refs (HEAD, local and
 * remote branches, tags). The typed text is also offered as a ref of its own so
 * SHAs and expressions like `HEAD~3` work. Enter compares the ref with the
 * working tree; Cmd/Ctrl+Enter starts from the merge base of HEAD and the ref.
 */

/** Looks like something other than a ref name: a SHA or a rev expression. */
function looksLikeRevision(text) {
  return /^[0-9a-f]{7,40}$/i.test(text) || /[~^@:]/.test(text);
}

const KIND_LABEL = { head: 'HEAD', branch: 'branch', remote: 'remote', tag: 'tag' };

/**
 * Palette entry (WorkspaceRow shape) for one `listRefs` result.
 *
 * @param {{ name: string, kind: string, sha?: string, subject?: string, date?: string }} ref
 */
export function refEntry(ref) {
  return {
    kind: 'ref',
    id: `ref:${ref.kind}:${ref.name}`,
    title: ref.name,
    subtitle: [ref.sha ?? '', ref.subject ?? ''].filter(Boolean).join(' · '),
    ref: ref.name,
    refKind: ref.kind === 'head' ? '' : (KIND_LABEL[ref.kind] ?? ''),
    prState: '',
    hasWorktree: false,
    stale: false,
    active: false,
  };
}

/** Entry that uses the typed text as the ref. */
export function customRefEntry(text) {
  return {
    kind: 'ref',
    id: `ref:custom:${text}`,
    title: text,
    subtitle: 'Use as ref (branch, tag, SHA, HEAD~3, …)',
    ref: text,
    refKind: '',
    prState: '',
    hasWorktree: false,
    stale: false,
    active: false,
  };
}

/**
 * Fuzzy-filter refs by name, keeping the listing order (HEAD, then most recent
 * commit first) for an empty query. A non-empty query that is not exactly a
 * listed name is offered as a custom ref: first when it looks like a SHA or a
 * rev expression, last otherwise.
 *
 * @returns {{ entry: ReturnType<typeof refEntry>, score: number, indices: number[] }[]}
 */
export function filterRefItems(refs, query, limit = Infinity) {
  const text = (query ?? '').trim();
  const q = text.toLowerCase();
  const list = refs ?? [];

  if (!q) return list.slice(0, limit).map((r) => ({ entry: refEntry(r), score: 0, indices: [] }));

  const matched = [];

  list.forEach((r, i) => {
    const m = fuzzyMatch(q, r.name);

    if (m) matched.push({ entry: refEntry(r), score: m.score, indices: m.indices, i });
  });
  matched.sort((a, b) => b.score - a.score || a.i - b.i);
  const items = matched.slice(0, limit).map(({ entry, score, indices }) => ({ entry, score, indices }));

  if (list.some((r) => r.name === text)) return items;
  const custom = { entry: customRefEntry(text), score: 0, indices: [] };

  return looksLikeRevision(text) || items.length === 0 ? [custom, ...items] : [...items, custom];
}
