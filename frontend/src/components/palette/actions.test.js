import { describe, expect, it } from 'vitest';
import { BROWSE_ACTION, COMPARE_ACTION, HOME_ACTION, paletteItems } from './actions.js';

const ACTIONS = [HOME_ACTION, BROWSE_ACTION, COMPARE_ACTION];

const ENTRIES = [
  { kind: 'repo', id: 'repo:/a', title: 'conflicto', repoName: 'conflicto', updatedAt: '2026-10-01T00:00:00Z' },
  { kind: 'pr', id: 'pr:/a#7', title: 'Fix home screen layout', repoName: 'conflicto', prNumber: 7, updatedAt: '2026-10-02T00:00:00Z' },
];

const ids = (items) => items.map((i) => i.entry.id);

describe('paletteItems', () => {
  it('lists actions first for an empty query', () => {
    expect(ids(paletteItems(ACTIONS, ENTRIES, ''))).toEqual(['home:', 'browse:prs', 'compare:', 'pr:/a#7', 'repo:/a']);
  });

  it.each([
    ['home', 'home:'],
    ['go home', null],
    ['browse', 'browse:prs'],
    ['browse pull', 'browse:prs'],
    ['pull requests', 'browse:prs'],
    ['prs', 'browse:prs'],
    ['diff', 'compare:'],
    ['diff against', 'compare:'],
    ['diff ref', 'compare:'],
    ['compare', 'compare:'],
  ])('%s finds the action by its title or keywords', (query, id) => {
    const found = ids(paletteItems(ACTIONS, ENTRIES, query));

    if (id) expect(found).toContain(id);
    else expect(found).not.toContain('home:');
  });

  it('highlights the matched title characters of an action', () => {
    const item = paletteItems(ACTIONS, ENTRIES, 'browse').find((i) => i.entry.id === 'browse:prs');

    expect(item.indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('ranks actions and entries together by score', () => {
    // No action contains "conflicto": only the repo and its PR.
    expect(ids(paletteItems(ACTIONS, ENTRIES, 'conflicto')).sort()).toEqual(['pr:/a#7', 'repo:/a']);
    // "home" matches the Home action best, the PR title too.
    const home = ids(paletteItems(ACTIONS, ENTRIES, 'home'));

    expect(home[0]).toBe('home:');
    expect(home).toContain('pr:/a#7');
  });

  it('kind filters drop actions', () => {
    expect(ids(paletteItems(ACTIONS, ENTRIES, 'pr:'))).toEqual(['pr:/a#7']);
  });
});
