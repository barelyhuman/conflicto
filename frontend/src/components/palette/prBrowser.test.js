import { describe, expect, it } from 'vitest';
import {
  activeRepo,
  cachedPREntries,
  isCancellation,
  matchesPRState,
  mergePRItems,
  nextPRState,
  parsePaletteInput,
  parsePRQuery,
  prEntryFromSummary,
  prSearchKey,
} from './prBrowser.js';

describe('parsePaletteInput', () => {
  it('enters PR mode on a leading #', () => {
    expect(parsePaletteInput('#')).toEqual({ prMode: true, query: '' });
    expect(parsePaletteInput('#36')).toEqual({ prMode: true, query: '36' });
    expect(parsePaletteInput('# fix bug')).toEqual({ prMode: true, query: 'fix bug' });
  });

  it('keeps # elsewhere in the query as plain text', () => {
    expect(parsePaletteInput('repo#36')).toEqual({ prMode: false, query: 'repo#36' });
    expect(parsePaletteInput('')).toEqual({ prMode: false, query: '' });
  });
});

describe('parsePRQuery', () => {
  it('reads numeric queries with or without #', () => {
    expect(parsePRQuery('36')).toEqual({ text: '36', number: 36 });
    expect(parsePRQuery('#36')).toEqual({ text: '36', number: 36 });
    expect(parsePRQuery('  #7  ')).toEqual({ text: '7', number: 7 });
  });

  it('treats everything else as text', () => {
    expect(parsePRQuery('login fix')).toEqual({ text: 'login fix', number: null });
    expect(parsePRQuery('36a')).toEqual({ text: '36a', number: null });
    expect(parsePRQuery('')).toEqual({ text: '', number: null });
  });
});

describe('nextPRState', () => {
  it('cycles open -> merged -> closed -> all -> open', () => {
    expect(nextPRState('open')).toBe('merged');
    expect(nextPRState('merged')).toBe('closed');
    expect(nextPRState('closed')).toBe('all');
    expect(nextPRState('all')).toBe('open');
  });

  it('restarts at open for unknown states', () => {
    expect(nextPRState('bogus')).toBe('open');
  });
});

describe('isCancellation', () => {
  it('ignores context canceled errors only', () => {
    expect(isCancellation(new Error('context canceled'))).toBe(true);
    expect(isCancellation(new Error('gh: context canceled while running'))).toBe(true);
    expect(isCancellation('context canceled')).toBe(true);
    expect(isCancellation(new Error('gh not found'))).toBe(false);
    expect(isCancellation(undefined)).toBe(false);
  });
});

describe('prSearchKey', () => {
  it('differs by state and by normalised text', () => {
    expect(prSearchKey('open', 'Fix')).toBe(prSearchKey('open', 'fix'));
    expect(prSearchKey('open', 'fix')).not.toBe(prSearchKey('merged', 'fix'));
    expect(prSearchKey('open', '#36')).toBe(prSearchKey('open', '36'));
  });
});

describe('matchesPRState', () => {
  it('filters cached open PRs by state', () => {
    expect(matchesPRState('OPEN', 'open')).toBe(true);
    expect(matchesPRState('OPEN', 'all')).toBe(true);
    expect(matchesPRState('OPEN', 'merged')).toBe(false);
    expect(matchesPRState('', 'closed')).toBe(false);
  });
});

describe('cached PR entries', () => {
  const index = [
    { kind: 'repo', id: 'repo:/a', repoPath: '/a', repoName: 'a', active: true, title: 'a' },
    { kind: 'pr', id: 'pr:/a#1', repoPath: '/a', repoName: 'a', prNumber: 1, prState: 'OPEN', title: 'First', subtitle: 'a · #1 · @ann', branch: 'one', hasWorktree: false, path: '' },
    { kind: 'pr', id: 'pr:/b#2', repoPath: '/b', repoName: 'b', prNumber: 2, prState: 'OPEN', title: 'Other', subtitle: 'b · #2 · @bob', branch: 'two', hasWorktree: false, path: '' },
    { kind: 'worktree', id: 'wt:/a/x', repoPath: '/a', repoName: 'a', title: 'x', active: false },
  ];

  it('keeps only PRs of the given repo', () => {
    const out = cachedPREntries(index, '/a');

    expect(out.map((e) => e.prNumber)).toEqual([1]);
    expect(out[0].title).toBe('#1 First');
    expect(out[0].subtitle).toBe('@ann · one');
  });

  it('returns nothing without an active repo', () => {
    expect(cachedPREntries(index, '')).toEqual([]);
  });

  it('finds the active repo from the flagged index entry', () => {
    expect(activeRepo(index)).toEqual({ repoPath: '/a', repoName: 'a' });
    expect(activeRepo([])).toEqual({ repoPath: '', repoName: '' });
  });
});

describe('prEntryFromSummary', () => {
  it('maps a live result to a PR entry with draft and local flags', () => {
    const e = prEntryFromSummary(
      { number: 9, title: 'Add thing', author: 'sid', state: 'OPEN', isDraft: true, headRef: 'feat', worktreePath: '/w' },
      '/repo',
    );

    expect(e).toMatchObject({
      kind: 'pr', id: 'pr:/repo#9', title: '#9 Add thing', prNumber: 9,
      prState: 'DRAFT', hasWorktree: true, path: '/w', repoPath: '/repo',
    });
    expect(e.subtitle).toBe('@sid · feat');
  });
});

describe('mergePRItems', () => {
  const item = (n, title) => ({ entry: { prNumber: n, title }, score: 0, indices: [] });

  it('puts live rows first and dedupes by number with live winning', () => {
    const live = [item(3, 'live three'), item(1, 'live one')];
    const cached = [item(1, 'cached one'), item(2, 'cached two')];
    const out = mergePRItems(live, cached);

    expect(out.map((i) => i.entry.prNumber)).toEqual([3, 1, 2]);
    expect(out[1].entry.title).toBe('live one');
  });

  it('handles empty sides', () => {
    expect(mergePRItems([], [item(5, 'x')]).map((i) => i.entry.prNumber)).toEqual([5]);
    expect(mergePRItems([item(6, 'y')], undefined).map((i) => i.entry.prNumber)).toEqual([6]);
    expect(mergePRItems([], [])).toEqual([]);
  });
});
