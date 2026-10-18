import { describe, expect, it } from 'vitest';
import { buildSections, formatAgo, groupEntries, listRepos, scopeToRepo } from './homeSections.js';

const e = (o) => ({
  kind: 'worktree', id: 'x', title: 't', subtitle: '', repoPath: '/a', repoName: 'a', path: '/a/wt',
  prNumber: 0, prState: '', branch: '', hasWorktree: false, stale: false, active: false, updatedAt: '', ...o,
});

describe('homeSections', () => {
  const entries = [
    e({ kind: 'repo', id: 'repo:/a', path: '/a' }),
    e({ id: 'wt:/a/1', updatedAt: '2026-01-01T00:00:00Z' }),
    e({ id: 'wt:/a/2', updatedAt: '2026-02-01T00:00:00Z' }),
    e({ kind: 'pr', id: 'pr:/a#1', prNumber: 1, prState: 'OPEN', hasWorktree: true }),
    e({ kind: 'pr', id: 'pr:/a#2', prNumber: 2, prState: 'OPEN', path: '' }),
    e({ id: 'wt:/a/old', stale: true, prState: 'MERGED' }),
    e({ kind: 'repo', id: 'repo:/b', repoPath: '/b', repoName: 'b', path: '/b' }),
  ];

  it('groups into open / prs / stale', () => {
    const g = groupEntries(entries);
    expect(g.open.map((x) => x.id).sort()).toEqual(
      ['pr:/a#1', 'repo:/a', 'repo:/b', 'wt:/a/1', 'wt:/a/2'].sort()
    );
    expect(g.prs.map((x) => x.id)).toEqual(['pr:/a#2']);
    expect(g.stale.map((x) => x.id)).toEqual(['wt:/a/old']);
  });

  it('sorts active first then recency', () => {
    const g = groupEntries([
      e({ id: 'a', updatedAt: '2026-03-01T00:00:00Z' }),
      e({ id: 'b', updatedAt: '2026-01-01T00:00:00Z', active: true }),
      e({ id: 'c', updatedAt: '2026-02-01T00:00:00Z' }),
    ]);
    expect(g.open.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('lists repos and scopes', () => {
    expect(listRepos(entries)).toEqual([
      { repoPath: '/a', repoName: 'a', count: 5 },
      { repoPath: '/b', repoName: 'b', count: 0 },
    ]);
    expect(scopeToRepo(entries, '/b')).toHaveLength(1);
    expect(scopeToRepo(entries, '')).toHaveLength(entries.length);
  });

  it('assigns contiguous positions and drops empty sections', () => {
    const { sections, flat } = buildSections(scopeToRepo(entries, '/a'));
    expect(sections.map((s) => s.key)).toEqual(['open', 'prs', 'stale']);
    expect(flat.map((i) => i.pos)).toEqual(flat.map((_, i) => i));
    expect(buildSections([]).sections).toEqual([]);
  });

  it('formats relative time', () => {
    expect(formatAgo(0, 1000)).toBe('never');
    expect(formatAgo(1000, 2000)).toBe('just now');
    expect(formatAgo(1001, 31001)).toBe('30s ago');
    expect(formatAgo(1, 180001)).toBe('3m ago');
    expect(formatAgo(1, 7200001)).toBe('2h ago');
  });
});
