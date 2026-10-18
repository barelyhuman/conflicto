import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchModel, groupByFile, matchRange, splitPreview } from './searchModel.js';

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

describe('search model', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(searchText) {
    const openFileAt = vi.fn();
    const model = createSearchModel({ api: { searchText }, openFileAt, debounceMs: 100, limit: 3 });

    return { model, openFileAt };
  }

  it('debounces typing and passes all options', async () => {
    const searchText = vi.fn(async () => [hit('a.go', 1, 1, 'x')]);
    const { model } = make(searchText);
    model.query.value = 'a';
    model.schedule();
    model.query.value = 'ab';
    model.schedule();
    model.toggle('word');
    model.glob.value = '*.go';
    await vi.advanceTimersByTimeAsync(150);
    expect(searchText).toHaveBeenCalledTimes(1);
    expect(searchText).toHaveBeenCalledWith({
      query: 'ab',
      regex: false,
      caseSensitive: false,
      wholeWord: true,
      glob: '*.go',
      limit: 3,
    });
    expect(model.status.value).toBe('done');
    expect(model.results.value).toHaveLength(1);
    expect(model.capped.value).toBe(false);
  });

  it('flags capped results when the limit is hit', async () => {
    const { model } = make(async () => [hit('a', 1, 1, ''), hit('a', 2, 1, ''), hit('a', 3, 1, '')]);
    model.query.value = 'x';
    await model.runNow();
    expect(model.capped.value).toBe(true);
  });

  it('ignores superseded (cancelled) searches', async () => {
    let n = 0;
    const searchText = vi.fn(() => {
      n++;

      return n === 1
        ? Promise.reject(new Error('search cancelled: context canceled'))
        : Promise.resolve([hit('b', 1, 1, 'second')]);
    });
    const { model } = make(searchText);
    model.query.value = 'x';
    const first = model.runNow();
    model.query.value = 'xy';
    const second = model.runNow();
    await Promise.all([first, second]);
    expect(model.status.value).toBe('done');
    expect(model.error.value).toBe('');
    expect(model.results.value[0].text).toBe('second');
  });

  it('surfaces real errors, clears on empty query, and opens results', async () => {
    const { model, openFileAt } = make(async () => {
      throw new Error('invalid regex');
    });
    model.query.value = '(';
    await model.runNow();
    expect(model.status.value).toBe('error');
    expect(model.error.value).toBe('invalid regex');
    model.query.value = '';
    await model.runNow();
    expect(model.status.value).toBe('idle');
    model.openResult(hit('f.go', 7, 3, ''));
    expect(openFileAt).toHaveBeenCalledWith('f.go', 7, 3);
  });

  it('open() switches to the search view, seeds the query and bumps focus', () => {
    const { model } = make(async () => []);
    const tick = model.focusTick.value;
    model.open('seed');
    expect(model.mode.value).toBe('search');
    expect(model.query.value).toBe('seed');
    expect(model.focusTick.value).toBe(tick + 1);
    model.showChanges();
    expect(model.mode.value).toBe('changes');
  });
});
