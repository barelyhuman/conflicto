import { describe, expect, it } from 'vitest';
import { buildPRLineAnnotations, buildReviewAnnotations, toPierreSide } from './prLineAnnotations.js';

describe('toPierreSide', () => {
  it('maps GitHub sides and defaults unknowns to additions', () => {
    expect(toPierreSide('LEFT')).toBe('deletions');
    expect(toPierreSide('RIGHT')).toBe('additions');
    expect(toPierreSide('deletions')).toBe('deletions');
    expect(toPierreSide(undefined)).toBe('additions');
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
      { path, line: 42, side: 'RIGHT', body: 'nits', user: { login: 'alice' } },
      { path: 'other.js', line: 1, side: 'LEFT', body: 'skip', user: { login: 'bob' } },
      { path, line: 10, side: 'LEFT', body: 'on left', user: { login: 'carol' } },
      { path, line: null, side: 'RIGHT', body: 'outdated', user: { login: 'dave' } },
    ];

    expect(buildPRLineAnnotations({ isPRMode: true, comments, filename: path })).toEqual([
      {
        lineNumber: 42,
        side: 'additions',
        metadata: { body: 'nits', user: { login: 'alice' }, html_url: undefined },
      },
      {
        lineNumber: 10,
        side: 'deletions',
        metadata: { body: 'on left', user: { login: 'carol' }, html_url: undefined },
      },
    ]);
  });

  it('passes through html_url when present', () => {
    const comments = [
      {
        path,
        line: 3,
        side: 'RIGHT',
        body: 'link me',
        user: { login: 'alice' },
        html_url: 'https://github.com/o/r/pull/1#discussion_r1',
      },
    ];

    expect(buildPRLineAnnotations({ isPRMode: true, comments, filename: path })).toEqual([
      {
        lineNumber: 3,
        side: 'additions',
        metadata: {
          body: 'link me',
          user: { login: 'alice' },
          html_url: 'https://github.com/o/r/pull/1#discussion_r1',
        },
      },
    ]);
  });
});

describe('buildReviewAnnotations', () => {
  const filename = 'a.js';
  const draft = { id: 'd1', path: filename, line: 4, side: 'LEFT', body: 'x' };

  it('adds drafts and composer, skipping the draft being edited', () => {
    const composer = { path: filename, editId: 'd1', loc: { line: 4, side: 'LEFT' }, rev: 1 };
    const out = buildReviewAnnotations({
      isPRMode: true, comments: [], drafts: [draft, { ...draft, id: 'd2', path: 'z.js' }], composer, filename,
      outdatedIds: new Set(['d1']),
    });

    expect(out).toEqual([
      { lineNumber: 4, side: 'deletions', metadata: { kind: 'composer', composerRev: 1 } },
    ]);

    const drafts = buildReviewAnnotations({ isPRMode: true, drafts: [draft], filename, outdatedIds: new Set(['d1']) });

    expect(drafts[0].metadata).toMatchObject({ kind: 'draft', outdated: true });
  });

  it('returns undefined when nothing applies', () => {
    expect(buildReviewAnnotations({ isPRMode: false, drafts: [draft], filename })).toBeUndefined();
    expect(buildReviewAnnotations({ isPRMode: true, drafts: [], filename })).toBeUndefined();
  });
});
