/**
 * Fuzzy matcher for the command palette (pure, dependency-free).
 *
 * Query syntax
 * - Space-separated tokens; ALL tokens must match (AND).
 * - A token fuzzy-matches (in-order subsequence) a haystack built from
 *   "repoName title branch #<prNumber> kind keywords". Bonuses: word starts, camelCase
 *   humps, contiguous runs; small penalty for gaps and late starts.
 * - Numeric token (`36` or `#36`): exact PR number match gets a very strong
 *   bonus; a PR number that merely starts with the digits gets a medium one
 *   (so results narrow while typing); otherwise it falls back to fuzzy.
 * - Kind filter prefix: `pr:`, `wt:` (alias `worktree:`), `repo:`. The rest of
 *   the token (if any) is fuzzy-matched as usual, e.g. `pr:ccto`. A bare
 *   `pr:` just filters. Plain words like `pr` / `wt` still match the kind text
 *   in the haystack as an ordinary fuzzy token (soft bonus, no filtering).
 * - Empty query: active first, then entries with worktrees, then updatedAt desc.
 *
 * `filterEntries` returns `[{ entry, score, indices }]`, best first, where
 * `indices` are sorted char positions in `entry.title` to highlight.
 */

const KIND_PREFIXES = {
  'pr:': 'pr',
  'wt:': 'worktree',
  'worktree:': 'worktree',
  'repo:': 'repo',
};

const SCORE_BOUNDARY = 10;
const SCORE_CONSECUTIVE = 6;
const SCORE_MATCH = 2;
const PENALTY_GAP = 1.5;
const PENALTY_START = 0.5;
const SCORE_PR_EXACT = 1000;
const SCORE_PR_PREFIX = 150;

/** Is index i the start of a word (or camelCase hump) in the original-case string? */
function isBoundary(s, i) {
  if (i === 0) return true;
  const prev = s.charCodeAt(i - 1);
  const cur = s.charCodeAt(i);
  const prevLower = prev >= 97 && prev <= 122;
  const prevAlnum = prevLower || (prev >= 48 && prev <= 57) || (prev >= 65 && prev <= 90);

  if (!prevAlnum) return true;

  return prevLower && cur >= 65 && cur <= 90;
}

/**
 * Match one token against text. Tries successive occurrences of the first char
 * as the start and keeps the best-scoring greedy subsequence.
 *
 * @param {string} token lowercase
 * @param {string} text original case
 * @param {string} [lower] text.toLowerCase()
 * @returns {{ score: number, indices: number[] } | null}
 */
export function fuzzyMatch(token, text, lower = text.toLowerCase()) {
  const m = token.length;
  const n = lower.length;

  if (m === 0) return { score: 0, indices: [] };

  if (m > n) return null;

  let best = null;
  let start = lower.indexOf(token[0]);
  let tries = 0;

  while (start !== -1 && tries < 12) {
    tries++;
    const indices = [start];
    let pos = start;
    let ok = true;

    for (let k = 1; k < m; k++) {
      let next = lower.indexOf(token[k], pos + 1);

      if (next === -1) {
        ok = false;
        break;
      }

      // Nearest occurrence is mid-word: prefer a word start shortly after.
      if (next !== pos + 1 && !isBoundary(text, next)) {
        const limit = Math.min(n, next + 6);

        for (let j = next + 1; j < limit; j++) {
          if (lower[j] === token[k] && isBoundary(text, j)) {
            next = j;
            break;
          }
        }
      }

      indices.push(next);
      pos = next;
    }

    // A failed greedy walk means later starts cannot succeed either.
    if (!ok) break;

    let score = 0;

    for (let k = 0; k < m; k++) {
      const idx = indices[k];
      score += SCORE_MATCH;

      if (isBoundary(text, idx)) score += SCORE_BOUNDARY;

      if (k > 0) {
        const gap = idx - indices[k - 1] - 1;

        if (gap === 0) score += SCORE_CONSECUTIVE;
        else score -= Math.min(gap, 8) * PENALTY_GAP;
      }
    }

    score -= Math.min(indices[0], 20) * PENALTY_START;

    if (!best || score > best.score) best = { score, indices };

    start = lower.indexOf(token[0], start + 1);
  }

  return best;
}

/**
 * @param {string} query
 * @returns {{ kind: string|null, text: string, num: number|null }[]}
 */
export function parseQuery(query) {
  const tokens = [];

  for (const raw of (query ?? '').toLowerCase().split(/\s+/)) {
    if (!raw) continue;
    let kind = null;
    let text = raw;

    for (const prefix of Object.keys(KIND_PREFIXES)) {
      if (raw.startsWith(prefix)) {
        kind = KIND_PREFIXES[prefix];
        text = raw.slice(prefix.length);
        break;
      }
    }

    const numMatch = /^#?(\d+)$/.exec(text);
    tokens.push({
      kind,
      text: numMatch ? numMatch[1] : text,
      num: numMatch ? Number(numMatch[1]) : null,
    });
  }

  return tokens;
}

const haystackCache = new WeakMap();

function haystackOf(entry) {
  let h = haystackCache.get(entry);

  if (!h) {
    const text = [
      entry.repoName,
      entry.title,
      entry.branch,
      entry.prNumber ? `#${entry.prNumber}` : '',
      entry.kind,
      entry.keywords,
    ].filter(Boolean).join(' ');
    h = { text, lower: text.toLowerCase() };
    haystackCache.set(entry, h);
  }

  return h;
}

/**
 * Score one entry against parsed tokens. Null when it does not match.
 *
 * @returns {{ score: number, indices: number[] } | null}
 */
export function scoreEntry(entry, tokens) {
  const { text, lower } = haystackOf(entry);
  const title = entry.title ?? '';
  const titleLower = title.toLowerCase();
  let total = 0;
  const indexSet = new Set();

  for (const tok of tokens) {
    if (tok.kind && entry.kind !== tok.kind) return null;

    if (!tok.text) continue;

    let tokScore = null;

    if (tok.num != null && entry.prNumber) {
      if (entry.prNumber === tok.num) tokScore = SCORE_PR_EXACT;
      else if (String(entry.prNumber).startsWith(tok.text)) tokScore = SCORE_PR_PREFIX;
    }

    if (tokScore == null) {
      const r = fuzzyMatch(tok.text, text, lower);

      if (!r) return null;
      tokScore = r.score;
    }

    total += tokScore;

    if (tok.num == null) {
      const tr = fuzzyMatch(tok.text, title, titleLower);

      if (tr) tr.indices.forEach((i) => indexSet.add(i));
    }
  }

  if (entry.active) total += 0.5;

  return { score: total, indices: [...indexSet].sort((a, b) => a - b) };
}

function time(entry) {
  const t = Date.parse(entry.updatedAt ?? '');

  return Number.isNaN(t) ? 0 : t;
}

/** Order used for empty queries and as a score tie-break. */
export function compareDefault(a, b) {
  if (Boolean(a.active) !== Boolean(b.active)) return a.active ? -1 : 1;

  const aw = Boolean(a.hasWorktree) || a.kind === 'worktree';
  const bw = Boolean(b.hasWorktree) || b.kind === 'worktree';

  if (aw !== bw) return aw ? -1 : 1;

  return time(b) - time(a);
}

/**
 * @template {Record<string, any>} T
 * @param {T[]} entries
 * @param {string} query
 * @param {number} [limit]
 * @returns {{ entry: T, score: number, indices: number[] }[]}
 */
export function filterEntries(entries, query, limit = Infinity) {
  const tokens = parseQuery(query);
  const searching = tokens.some((t) => t.text || t.kind);

  if (!searching) {
    return [...entries]
      .sort(compareDefault)
      .slice(0, limit)
      .map((entry) => ({ entry, score: 0, indices: [] }));
  }

  const out = [];

  for (const entry of entries) {
    const r = scoreEntry(entry, tokens);

    if (r) out.push({ entry, score: r.score, indices: r.indices });
  }

  out.sort((a, b) => b.score - a.score || compareDefault(a.entry, b.entry));

  return out.slice(0, limit);
}
