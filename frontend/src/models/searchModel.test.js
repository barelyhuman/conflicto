import { describe, expect, it } from 'vitest';
import { groupByFile, matchRange, splitPreview } from './searchModel.js';

const hit = (path, line, col, text) => ({ path, line, col, text });

describe('matchRange / splitPreview', () => {
  const spec = { query: 'foo', regex: false, caseSensitive: false, wholeWord: false };

  it('uses len when present (references)', () => {
    expect(matchRange({ ...hit('a', 1, 5, 'xxx Foo yy'), len: 3 })).toEqual([4, 7]);
  });

  it('re-matches with the query options (case, whole word, regex)', () => {
    expect(matchRange(hit('a', 1, 5, 'xxx FOO yy'), spec)).toEqual([4, 7]);
    expect(matchRange(hit('a', 1, 1, 'afoo foo'), { ...spec, wholeWord: true })).toEqual([5, 8]);
    expect(matchRange(hit('a', 1, 1, 'a12b'), { ...spec, query: '\\d+', regex: true })).toEqual([1, 3]);
    // invalid regex never throws
    expect(matchRange(hit('a', 1, 1, 'abc'), { ...spec, query: '(', regex: true })).toBeTruthy();
  });

  it('trims indentation and splits around the hit', () => {
    expect(splitPreview(hit('a', 1, 3, '\t\tcall(foo)'), { ...spec, query: 'call' })).toEqual({
      pre: '',
      hit: 'call',
      post: '(foo)',
    });
  });
});

describe('groupByFile', () => {
  it('keeps first-seen file order', () => {
    const g = groupByFile([hit('b', 1, 1, ''), hit('a', 1, 1, ''), hit('b', 2, 1, '')]);
    expect(g.map((x) => [x.path, x.items.length])).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
  });
});
