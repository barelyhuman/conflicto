import { describe, expect, it } from 'vitest';
import { escapeStep, initialActive, keyAction, moveActive, rankItems } from './searchableMenu.js';

const mk = (id, o = {}) => ({ id, label: id, ...o });

describe('rankItems', () => {
  it('keeps order for an empty query', () => {
    const items = [mk('b'), mk('a'), mk('c')];
    expect(rankItems(items, '').map((r) => r.item.id)).toEqual(['b', 'a', 'c']);
    expect(rankItems(items, '  ').map((r) => r.pos)).toEqual([0, 1, 2]);
  });

  it('filters and ranks, returning label indices', () => {
    const items = [mk('feature/login'), mk('main'), mk('fix-login-bug')];
    const r = rankItems(items, 'main');
    expect(r.map((x) => x.item.id)).toEqual(['main']);
    expect(r[0].indices).toEqual([0, 1, 2, 3]);
  });

  it('requires every token to match', () => {
    const items = [mk('alpha', { sublabel: '/repos/one' }), mk('beta', { sublabel: '/repos/two' })];
    expect(rankItems(items, 'alp one').map((x) => x.item.id)).toEqual(['alpha']);
    expect(rankItems(items, 'alp two')).toEqual([]);
  });

  it('matches sublabel and keywords, highlighting only the sublabel', () => {
    const items = [mk('x', { sublabel: '…/work/tree', keywords: ['/full/path/zzz'] })];
    const sub = rankItems(items, 'work');
    expect(sub[0].subIndices.length).toBe(4);
    expect(sub[0].indices).toEqual([]);
    const kw = rankItems(items, 'zzz');
    expect(kw).toHaveLength(1);
    expect(kw[0].subIndices).toEqual([]);
  });

  it('prefers label matches over sublabel matches', () => {
    const items = [mk('zzz', { sublabel: 'foo' }), mk('foo')];
    expect(rankItems(items, 'foo')[0].item.id).toBe('foo');
  });

  it('keeps groups together in first-appearance order', () => {
    const items = [
      mk('l-main', { group: 'Local' }),
      mk('l-dev', { group: 'Local' }),
      mk('r-main', { group: 'Remote' }),
      mk('r-dev', { group: 'Remote' }),
    ];
    expect(rankItems(items, 'dev').map((x) => x.item.id)).toEqual(['l-dev', 'r-dev']);
    expect(rankItems(items, 'main').map((x) => x.item.id)).toEqual(['l-main', 'r-main']);
    expect(rankItems(items, '').map((x) => x.pos)).toEqual([0, 1, 2, 3]);
  });
});

describe('moveActive', () => {
  it('wraps in both directions', () => {
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 3)).toBe(1);
  });

  it('handles empty and unset', () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
    expect(moveActive(5, 1, 3)).toBe(0);
  });
});

describe('escapeStep', () => {
  it('clears first, then closes', () => {
    expect(escapeStep('abc')).toBe('clear');
    expect(escapeStep('')).toBe('close');
  });
});

describe('initialActive', () => {
  const r = rankItems([mk('a'), mk('b', { current: true })], '');

  it('starts on the current item for an empty query', () => {
    expect(initialActive(r, '')).toBe(1);
  });

  it('starts on the top hit while searching and -1 when empty', () => {
    expect(initialActive(r, 'a')).toBe(0);
    expect(initialActive([], 'a')).toBe(-1);
  });
});

describe('keyAction', () => {
  it('maps arrows, Ctrl+N/P, Enter, Escape', () => {
    expect(keyAction({ key: 'ArrowDown' })).toBe('next');
    expect(keyAction({ key: 'ArrowUp' })).toBe('prev');
    expect(keyAction({ key: 'n', ctrlKey: true })).toBe('next');
    expect(keyAction({ key: 'p', ctrlKey: true })).toBe('prev');
    expect(keyAction({ key: 'Enter' })).toBe('select');
    expect(keyAction({ key: 'Escape' })).toBe('escape');
  });

  it('ignores plain letters, meta combos and IME composition', () => {
    expect(keyAction({ key: 'n' })).toBeNull();
    expect(keyAction({ key: 'n', ctrlKey: true, metaKey: true })).toBeNull();
    expect(keyAction({ key: 'Enter', isComposing: true })).toBeNull();
  });
});
