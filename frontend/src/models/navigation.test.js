import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { SelectionModel } from './selection.js';
import { WorkingTreeModel } from './workingTree.js';
import { createNavigator, openFileAt, registerNavigator } from './navigation.js';

describe('navigation', () => {
  let selection;
  let workingTree;
  let activePR;
  let prFiles;
  let open;

  beforeEach(() => {
    activePR = signal(null);
    prFiles = [];
    workingTree = new WorkingTreeModel({ api: {} });
    selection = new SelectionModel({
      workingTree,
      activePR,
      api: { getDiff: vi.fn(), getPRFileDiff: vi.fn() },
    });
    workingTree.applyStatus({
      staged: [{ path: 'staged.go' }, { path: 'both.go' }],
      unstaged: [{ path: 'dirty.go' }, { path: 'both.go' }],
      conflicts: [{ path: 'conflict.go' }],
    });
    open = createNavigator({ selection, workingTree, isPRFile: (p) => prFiles.includes(p) });
  });

  afterEach(() => {
    selection[Symbol.dispose]?.();
  });

  it('opens a clean file in the editor at the line', () => {
    expect(open('clean.go', 12)).toBe(true);
    expect(selection.activeFile.value).toBe('clean.go');
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.editorGotoLine.value).toBe(12);
  });

  it('defaults to line 1 for a clean file with no line', () => {
    open('clean.go');
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.editorGotoLine.value).toBe(1);
  });

  it('shows the diff for a changed file when no line is given', () => {
    open('dirty.go');
    expect(selection.activeSection.value).toBe('unstaged');
    expect(selection.viewMode.value).toBe('diff');
  });

  it('opens a changed file in the editor when a line is given', () => {
    open('dirty.go', 30, 4);
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.editorGotoLine.value).toBe(30);
  });

  it('shows the staged diff for staged-only files', () => {
    open('staged.go', 3);
    expect(selection.activeSection.value).toBe('staged');
    expect(selection.viewMode.value).toBe('diff');
  });

  it('prefers the unstaged (editable) view when a file is both', () => {
    open('both.go', 3);
    expect(selection.activeSection.value).toBe('unstaged');
    expect(selection.viewMode.value).toBe('edit');
  });

  it('selects conflicts in the conflict section', () => {
    open('conflict.go', 3);
    expect(selection.activeSection.value).toBe('conflict');
  });

  it('in PR mode only opens files that are in the PR', () => {
    activePR.value = 7;
    prFiles = ['pr.go'];
    expect(open('nope.go', 1)).toBe(false);
    expect(selection.activeFile.value).toBeNull();
    expect(open('pr.go', 1)).toBe(true);
    expect(selection.activeSection.value).toBe('pr');
  });

  it('rejects empty paths', () => {
    expect(open('')).toBe(false);
  });

  it('openFileAt delegates to the registered navigator', () => {
    expect(openFileAt('a.go', 1)).toBe(false);
    const impl = vi.fn(() => true);
    const off = registerNavigator(impl);
    expect(openFileAt('a.go', 5, 2)).toBe(true);
    expect(impl).toHaveBeenCalledWith('a.go', 5, 2);
    off();
    expect(openFileAt('a.go', 1)).toBe(false);
  });
});
