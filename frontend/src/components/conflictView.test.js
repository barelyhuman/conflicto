import { describe, expect, it } from 'vitest';
// parseMergeConflictDiffFromFile is not re-exported from the package root;
// import it directly so this test fails loudly if the internal path moves.
import { parseMergeConflictDiffFromFile } from '../../node_modules/@pierre/diffs/dist/utils/parseMergeConflictDiffFromFile.js';
import { conflictViewFromContents } from './conflictView.js';

const twoWay = [
  'function start() {',
  '<<<<<<< HEAD',
  'console.log("ours");',
  '=======',
  'console.log("theirs");',
  '>>>>>>> feature',
  '}',
  '',
].join('\n');

const threeWay = [
  '<<<<<<< HEAD',
  'ours',
  '||||||| base',
  'base',
  '=======',
  'theirs',
  '>>>>>>> feature',
  '',
].join('\n');

describe('conflictViewFromContents', () => {
  it('builds a view when the worktree side is available', () => {
    expect(
      conflictViewFromContents('app.js', { hasNew: true, newContent: 'body' })
    ).toEqual({
      loading: false,
      view: { path: 'app.js', contents: 'body' },
    });
  });

  it('treats a missing worktree side as no data', () => {
    expect(
      conflictViewFromContents('app.js', { hasOld: true, oldContent: 'body' })
    ).toEqual({ loading: false, view: null });
    expect(conflictViewFromContents('app.js', null)).toEqual({
      loading: false,
      view: null,
    });
  });

  it('falls back to empty contents', () => {
    expect(conflictViewFromContents('app.js', { hasNew: true })).toEqual({
      loading: false,
      view: { path: 'app.js', contents: '' },
    });
  });
});

describe('parseMergeConflictDiffFromFile contract', () => {
  it('derives hunks, actions and marker rows from standard markers', () => {
    const parsed = parseMergeConflictDiffFromFile({
      name: 'app.js',
      contents: twoWay,
    });
    expect(parsed.fileDiff?.hunks.length).toBeGreaterThan(0);
    expect(parsed.actions.filter(Boolean).length).toBeGreaterThan(0);
    expect(parsed.markerRows.length).toBeGreaterThan(0);
  });

  it('handles diff3 base markers', () => {
    const parsed = parseMergeConflictDiffFromFile({
      name: 'app.js',
      contents: threeWay,
    });
    expect(parsed.fileDiff?.hunks.length).toBeGreaterThan(0);
    expect(parsed.actions.filter(Boolean).length).toBeGreaterThan(0);
    expect(parsed.markerRows.length).toBeGreaterThan(0);
  });

  it('does not crash on marker-free contents', () => {
    const parsed = parseMergeConflictDiffFromFile({
      name: 'app.js',
      contents: 'plain\n',
    });
    expect(parsed.actions.filter(Boolean).length).toBe(0);
    expect(parsed.markerRows.length).toBe(0);
  });
});
