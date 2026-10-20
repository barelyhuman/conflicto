import { describe, expect, it } from 'vitest';
import { customRefEntry, filterRefItems, refEntry } from './refBrowser.js';

const REFS = [
  { name: 'HEAD', kind: 'head', sha: 'aaa1111', subject: 'wip' },
  { name: 'feat/redesign', kind: 'branch', sha: 'aaa1111', subject: 'wip' },
  { name: 'main', kind: 'branch', sha: 'bbb2222', subject: 'release' },
  { name: 'origin/main', kind: 'remote', sha: 'bbb2222', subject: 'release' },
  { name: 'v1.0.0', kind: 'tag', sha: 'ccc3333', subject: 'tag' },
];

const titles = (items) => items.map((i) => i.entry.title);

describe('refEntry', () => {
  it('builds a palette row with the ref kind as badge (none for HEAD)', () => {
    expect(refEntry(REFS[2])).toMatchObject({ kind: 'ref', ref: 'main', refKind: 'branch', subtitle: 'bbb2222 · release' });
    expect(refEntry(REFS[0]).refKind).toBe('');
  });
});

describe('filterRefItems', () => {
  it('keeps listing order for an empty query', () => {
    expect(titles(filterRefItems(REFS, ''))).toEqual(REFS.map((r) => r.name));
  });

  it('fuzzy-filters by name and offers the text as a custom ref last', () => {
    const items = filterRefItems(REFS, 'mai');

    expect(titles(items)).toEqual(['main', 'origin/main', 'mai']);
    expect(items[2].entry.id).toBe(customRefEntry('mai').id);
  });

  it('omits the custom ref on an exact name match', () => {
    expect(titles(filterRefItems(REFS, 'main'))).toEqual(['main', 'origin/main']);
  });

  it('puts SHAs and rev expressions first', () => {
    expect(titles(filterRefItems(REFS, 'HEAD~3'))[0]).toBe('HEAD~3');
    expect(titles(filterRefItems(REFS, 'abc1234'))[0]).toBe('abc1234');
  });

  it('offers only the custom ref when nothing matches', () => {
    expect(titles(filterRefItems(REFS, 'zzz'))).toEqual(['zzz']);
  });
});
