import { describe, expect, it } from 'vitest';
import { fuzzyMatch, parseQuery, filterEntries } from './fuzzy.js';

const e = (o) => ({
  kind: 'repo', id: o.id ?? Math.random().toString(), title: '', subtitle: '', repoPath: '', repoName: '',
  path: '', prNumber: 0, prState: '', branch: '', hasWorktree: false, stale: false, active: false,
  updatedAt: '', ...o,
});

describe('fuzzyMatch', () => {
  it('matches subsequences and returns indices', () => {
    const r = fuzzyMatch('ccto', 'conflicto');
    expect(r.indices).toEqual([0, 6, 7, 8]);
  });

  it('returns null when not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'conflicto')).toBeNull();
    expect(fuzzyMatch('otc', 'cto')).toBeNull();
    expect(fuzzyMatch('toolong', 'to')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('abc', 'AbC')).not.toBeNull();
  });

  it('prefers contiguous over scattered', () => {
    const a = fuzzyMatch('fix', 'fix bug');
    const b = fuzzyMatch('fix', 'f12i34x');
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('prefers word starts', () => {
    const a = fuzzyMatch('pr', 'open pr list');
    const b = fuzzyMatch('pr', 'improve');
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('prefers a word-start occurrence over an earlier mid-word one', () => {
    const r = fuzzyMatch('ab', 'xa_xb ab');
    expect(r.indices).toEqual([6, 7]);
  });

  it('empty token matches', () => {
    expect(fuzzyMatch('', 'abc')).toEqual({ score: 0, indices: [] });
  });
});

describe('parseQuery', () => {
  it('splits tokens and detects numbers', () => {
    expect(parseQuery('  ccto   #36 ')).toEqual([
      { kind: null, text: 'ccto', num: null },
      { kind: null, text: '36', num: 36 },
    ]);
  });

  it('parses kind prefixes', () => {
    expect(parseQuery('pr:foo wt: repo:')).toEqual([
      { kind: 'pr', text: 'foo', num: null },
      { kind: 'worktree', text: '', num: null },
      { kind: 'repo', text: '', num: null },
    ]);
    expect(parseQuery('worktree:x')[0].kind).toBe('worktree');
  });
});

describe('filterEntries', () => {
  const repo = e({ id: 'repo', kind: 'repo', title: 'conflicto', repoName: 'conflicto' });
  const pr36 = e({ id: 'pr36', kind: 'pr', title: 'Show checks status', repoName: 'conflicto', prNumber: 36, prState: 'OPEN', branch: 'checks' });
  const pr5 = e({ id: 'pr5', kind: 'pr', title: 'Fix 36 flaky tests', repoName: 'conflicto', prNumber: 5 });
  const other = e({ id: 'other', kind: 'repo', title: 'dotfiles', repoName: 'dotfiles' });
  const all = [repo, pr5, pr36, other];

  it('ranks conflicto PR #36 first for "ccto 36"', () => {
    const r = filterEntries(all, 'ccto 36');
    expect(r[0].entry.id).toBe('pr36');
    expect(r.find((x) => x.entry.id === 'other')).toBeUndefined();
  });

  it('accepts #36', () => {
    expect(filterEntries(all, '#36')[0].entry.id).toBe('pr36');
  });

  it('requires all tokens (AND)', () => {
    expect(filterEntries(all, 'conflicto dotfiles')).toEqual([]);
  });

  it('kind prefix filters', () => {
    const r = filterEntries(all, 'pr:');
    expect(r.map((x) => x.entry.id).sort()).toEqual(['pr36', 'pr5']);
    expect(filterEntries(all, 'repo:dot').map((x) => x.entry.id)).toEqual(['other']);
  });

  it('plain kind word is a soft match, not a filter', () => {
    const r = filterEntries(all, 'pr');
    expect(r.length).toBeGreaterThan(0);
  });

  it('returns title highlight indices', () => {
    const r = filterEntries([repo], 'cto');
    expect(r[0].indices).toEqual([6, 7, 8]);
  });

  it('empty query: active, then worktrees, then updatedAt desc', () => {
    const a = e({ id: 'a', updatedAt: '2024-01-01T00:00:00Z' });
    const b = e({ id: 'b', updatedAt: '2025-01-01T00:00:00Z' });
    const c = e({ id: 'c', kind: 'worktree', updatedAt: '2020-01-01T00:00:00Z' });
    const d = e({ id: 'd', active: true, updatedAt: '2000-01-01T00:00:00Z' });
    const f = e({ id: 'f', kind: 'pr', hasWorktree: true, updatedAt: '2019-01-01T00:00:00Z' });
    const ids = filterEntries([a, b, c, d, f], '').map((x) => x.entry.id);
    expect(ids).toEqual(['d', 'c', 'f', 'b', 'a']);
  });

  it('respects limit and does not mutate input', () => {
    const input = [...all];
    expect(filterEntries(input, '', 2)).toHaveLength(2);
    expect(input).toEqual(all);
  });

  it('is fast for 2000 entries', () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      e({ id: `${i}`, kind: 'pr', title: `Feature number ${i} for repo-${i % 50}`, repoName: `repo-${i % 50}`, prNumber: i, branch: `feat/x-${i}` }));
    const t = performance.now();
    filterEntries(many, 'repo feat 12');
    filterEntries(many, 'frn 1999');
    expect(performance.now() - t).toBeLessThan(250);
  });
});
