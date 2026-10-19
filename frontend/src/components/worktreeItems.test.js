import { describe, expect, it } from 'vitest';
import { buildWorktreeItems, isActiveWorktree, shortenPath, staleByPath } from './worktreeItems.js';

const wt = (o) => ({ path: '/r', branch: 'main', head: 'abc', isMain: false, isCurrent: false, ...o });

describe('shortenPath', () => {
  it('keeps short paths and elides long ones', () => {
    expect(shortenPath('/a/b')).toBe('/a/b');
    expect(shortenPath('/Users/me/code/repo/wt')).toBe('…/code/repo/wt');
    expect(shortenPath('')).toBe('');
  });
});

describe('isActiveWorktree', () => {
  it('prefers currentPath, falls back to isCurrent', () => {
    expect(isActiveWorktree(wt({ path: '/a', isCurrent: true }), '/b')).toBe(false);
    expect(isActiveWorktree(wt({ path: '/b' }), '/b')).toBe(true);
    expect(isActiveWorktree(wt({ isCurrent: true }), '')).toBe(true);
  });
});

describe('staleByPath', () => {
  it('uses PR state when known, joined by path', () => {
    const m = staleByPath([
      { kind: 'worktree', path: '/a', stale: true },
      { kind: 'pr', path: '/b', stale: true, prState: 'MERGED' },
      { kind: 'pr', path: '/c', stale: true, prState: 'CLOSED' },
      { kind: 'worktree', path: '/d', stale: false },
      { kind: 'repo', path: '/e', stale: true },
    ]);
    expect([...m]).toEqual([['/a', 'stale'], ['/b', 'merged'], ['/c', 'closed']]);
  });
});

describe('buildWorktreeItems', () => {
  it('builds labelled items with current and stale info', () => {
    const items = buildWorktreeItems(
      [wt({ path: '/Users/me/code/repo', isMain: true }), wt({ path: '/x/y/z/feat', branch: '', head: 'deadbee' })],
      '/x/y/z/feat',
      [{ kind: 'worktree', path: '/x/y/z/feat', stale: true, prState: 'MERGED' }]
    );
    expect(items[0]).toMatchObject({ label: 'main', isMain: true, current: false, stale: null });
    expect(items[1]).toMatchObject({ label: 'deadbee', current: true, stale: 'merged', sublabel: '…/y/z/feat' });
    expect(items[1].keywords).toEqual(['/x/y/z/feat']);
  });
});
