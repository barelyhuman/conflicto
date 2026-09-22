import { describe, expect, it } from 'vitest';
import {
  conflictKindLabel,
  conflictViewFromStages,
  hasConflictMarkers,
} from './conflictView.js';

const markedWorktree = [
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

describe('hasConflictMarkers', () => {
  it('matches start markers at line start', () => {
    expect(hasConflictMarkers(markedWorktree)).toBe(true);
    expect(hasConflictMarkers(threeWay)).toBe(true);
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\r\nb\n')).toBe(true);
  });

  it('ignores markers not at line start and marker-free content', () => {
    expect(hasConflictMarkers('x <<<<<<< HEAD\n')).toBe(false);
    expect(hasConflictMarkers('plain\n')).toBe(false);
    expect(hasConflictMarkers(undefined)).toBe(false);
  });
});

describe('conflictKindLabel', () => {
  it('labels every unmerged code', () => {
    expect(conflictKindLabel('UU')).toBe('both modified');
    expect(conflictKindLabel('AA')).toBe('both added');
    expect(conflictKindLabel('DD')).toBe('both deleted');
    expect(conflictKindLabel('AU')).toBe('added by us');
    expect(conflictKindLabel('UA')).toBe('added by them');
    expect(conflictKindLabel('DU')).toBe('deleted by us');
    expect(conflictKindLabel('UD')).toBe('deleted by them');
  });

  it('is undefined for non-conflict statuses', () => {
    expect(conflictKindLabel('M')).toBeUndefined();
    expect(conflictKindLabel('C')).toBeUndefined();
    expect(conflictKindLabel(undefined)).toBeUndefined();
  });
});

describe('conflictViewFromStages', () => {
  it('routes marker conflicts to the marker view', () => {
    expect(
      conflictViewFromStages('f.txt', {
        hasWorktree: true,
        worktree: markedWorktree,
        hasOurs: true,
        ours: 'ours',
        hasTheirs: true,
        theirs: 'theirs',
      })
    ).toEqual({
      loading: false,
      view: { kind: 'markers', path: 'f.txt', contents: markedWorktree },
    });
  });

  it('routes modify/delete (deleted by them) to the sides view', () => {
    expect(
      conflictViewFromStages('f.txt', {
        hasWorktree: true,
        worktree: 'ours\n',
        hasOurs: true,
        ours: 'ours\n',
        hasTheirs: false,
      })
    ).toEqual({
      loading: false,
      view: { kind: 'sides', path: 'f.txt', ours: 'ours\n', theirs: null },
    });
  });

  it('routes modify/delete (deleted by us) to the sides view', () => {
    expect(
      conflictViewFromStages('f.txt', {
        hasWorktree: true,
        worktree: 'theirs\n',
        hasOurs: false,
        hasTheirs: true,
        theirs: 'theirs\n',
      })
    ).toEqual({
      loading: false,
      view: { kind: 'sides', path: 'f.txt', ours: null, theirs: 'theirs\n' },
    });
  });

  it('routes both-deleted to the deleted empty state', () => {
    expect(conflictViewFromStages('f.txt', null)).toEqual({
      loading: false,
      view: { kind: 'deleted' },
    });
    expect(
      conflictViewFromStages('f.txt', {
        hasWorktree: false,
        hasOurs: false,
        hasTheirs: false,
      })
    ).toEqual({ loading: false, view: { kind: 'deleted' } });
  });

  it('falls back to plain contents when no stages exist', () => {
    expect(
      conflictViewFromStages('f.txt', { hasWorktree: true, worktree: 'plain\n' })
    ).toEqual({
      loading: false,
      view: { kind: 'plain', path: 'f.txt', contents: 'plain\n' },
    });
  });
});
