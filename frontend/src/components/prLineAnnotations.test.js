import { describe, expect, it } from 'vitest';
import { buildPRLineAnnotations, toPierreSide } from './prLineAnnotations.js';

describe('toPierreSide', () => {
  it('maps GitHub LEFT/RIGHT and Pierre names', () => {
    expect(toPierreSide('LEFT')).toBe('deletions');
    expect(toPierreSide('RIGHT')).toBe('additions');
    expect(toPierreSide('left')).toBe('deletions');
    expect(toPierreSide('right')).toBe('additions');
    expect(toPierreSide('deletions')).toBe('deletions');
    expect(toPierreSide('additions')).toBe('additions');
  });

  it('defaults unknown or missing side to additions', () => {
    expect(toPierreSide(undefined)).toBe('additions');
    expect(toPierreSide('')).toBe('additions');
    expect(toPierreSide('SIDEWAYS')).toBe('additions');
  });
});

describe('buildPRLineAnnotations', () => {
  const path = 'src/foo.js';

  it('returns undefined when not in PR mode or no comments', () => {
    expect(buildPRLineAnnotations({ isPRMode: false, comments: [{ path, line: 1 }], filename: path })).toBeUndefined();
    expect(buildPRLineAnnotations({ isPRMode: true, comments: [], filename: path })).toBeUndefined();
  });

  it('maps matching comments to Pierre DiffLineAnnotation shape', () => {
    const comments = [
      {
        path,
        line: 42,
        side: 'RIGHT',
        body: 'nits',
        user: { login: 'alice' },
      },
      {
        path: 'other.js',
        line: 1,
        side: 'LEFT',
        body: 'skip',
        user: { login: 'bob' },
      },
      {
        path,
        line: 10,
        side: 'LEFT',
        body: 'on left',
        user: { login: 'carol' },
      },
      {
        path,
        line: null,
        side: 'RIGHT',
        body: 'outdated',
        user: { login: 'dave' },
      },
    ];

    expect(buildPRLineAnnotations({ isPRMode: true, comments, filename: path })).toEqual([
      {
        lineNumber: 42,
        side: 'additions',
        metadata: { body: 'nits', user: { login: 'alice' } },
      },
      {
        lineNumber: 10,
        side: 'deletions',
        metadata: { body: 'on left', user: { login: 'carol' } },
      },
    ]);
  });
});
