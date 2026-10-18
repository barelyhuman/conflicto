import { describe, expect, it } from 'vitest';
import {
  isDraftOutdated,
  lineInPatch,
  locationToRange,
  parseClipboardRef,
  parsePatchLines,
  rangeToLocation,
  refToLocation,
  toGitHubSide,
} from './reviewLines.js';

const patch = ['@@ -1,3 +1,4 @@', ' a', '-b', '+B', '+B2', ' c'].join('\n');

describe('side/location mapping', () => {
  it('maps sides', () => {
    expect(toGitHubSide('deletions')).toBe('LEFT');
    expect(toGitHubSide('additions')).toBe('RIGHT');
    expect(toGitHubSide(undefined)).toBe('RIGHT');
  });

  it('single line has no start', () => {
    expect(rangeToLocation({ start: 5, end: 5, side: 'additions' })).toEqual({ line: 5, side: 'RIGHT' });
  });

  it('multi line normalizes order and sets start', () => {
    expect(rangeToLocation({ start: 9, end: 4, side: 'deletions' })).toEqual({
      line: 9, side: 'LEFT', startLine: 4, startSide: 'LEFT',
    });
  });

  it('mixed sides keep selection order', () => {
    expect(rangeToLocation({ start: 2, side: 'deletions', end: 3, endSide: 'additions' })).toEqual({
      line: 3, side: 'RIGHT', startLine: 2, startSide: 'LEFT',
    });
  });

  it('rejects bad ranges and round-trips', () => {
    expect(rangeToLocation(null)).toBeNull();
    const loc = { line: 7, side: 'LEFT', startLine: 3, startSide: 'LEFT' };

    expect(rangeToLocation(locationToRange(loc))).toEqual(loc);
  });
});

describe('patch parsing', () => {
  it('collects line numbers per side', () => {
    const { left, right } = parsePatchLines(patch);

    expect([...left]).toEqual([1, 2, 3]);
    expect([...right]).toEqual([1, 2, 3, 4]);
    expect(lineInPatch(patch, 'LEFT', 4)).toBe(false);
    expect(lineInPatch(patch, 'RIGHT', 4)).toBe(true);
    expect(lineInPatch(null, 'RIGHT', 1)).toBe(false);
  });
});

describe('isDraftOutdated', () => {
  const d = { headSHA: 'old', line: 9, side: 'RIGHT' };

  it('is false when head unchanged or patch unknown', () => {
    expect(isDraftOutdated(d, { currentHeadSHA: 'old', patch })).toBe(false);
    expect(isDraftOutdated(d, { currentHeadSHA: 'new', patch: null })).toBe(false);
  });

  it('flags missing lines after head change', () => {
    expect(isDraftOutdated(d, { currentHeadSHA: 'new', patch })).toBe(true);
    expect(isDraftOutdated({ ...d, line: 2 }, { currentHeadSHA: 'new', patch })).toBe(false);
    expect(isDraftOutdated({ ...d, line: 2, startLine: 40, startSide: 'RIGHT' }, { currentHeadSHA: 'new', patch })).toBe(true);
  });
});

describe('parseClipboardRef', () => {
  const paths = ['src/app.jsx', 'pkg/util/foo.go'];

  it('parses path:line and strips the prefix', () => {
    expect(parseClipboardRef('src/app.jsx:42 - nil deref here', paths)).toEqual({
      path: 'src/app.jsx', startLine: 42, endLine: 42, rest: 'nil deref here',
    });
  });

  it('parses ranges, backticks and suffix matches', () => {
    const r = parseClipboardRef('`util/foo.go:10-20`: bad\nmore', paths);

    expect(r).toMatchObject({ path: 'pkg/util/foo.go', startLine: 10, endLine: 20 });
    expect(r.rest).toBe('bad\nmore');
  });

  it('returns null for unknown files or plain text', () => {
    expect(parseClipboardRef('other.js:3 x', paths)).toBeNull();
    expect(parseClipboardRef('just a comment', paths)).toBeNull();
    expect(parseClipboardRef('', paths)).toBeNull();
  });

  it('refToLocation prefers RIGHT, falls back to LEFT', () => {
    expect(refToLocation({ startLine: 2, endLine: 2 }, patch)).toEqual({ line: 2, side: 'RIGHT' });
    const delOnly = '@@ -1,2 +1,1 @@\n-x\n-y\n+z';

    expect(refToLocation({ startLine: 1, endLine: 2 }, delOnly)).toEqual({
      line: 2, side: 'LEFT', startLine: 1, startSide: 'LEFT',
    });
  });
});
