import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';

const getDiff = vi.fn();
const getPRFileDiff = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    getDiff: (...args) => getDiff(...args),
    getPRFileDiff: (...args) => getPRFileDiff(...args),
  },
}));

const { SelectionModel } = await import('./selection.js');

function makeWorkingTree(first = null) {
  return {
    firstEntry: () => first,
  };
}

describe('SelectionModel diffLoading', () => {
  /** @type {InstanceType<typeof SelectionModel>} */
  let selection;
  /** @type {import('@preact/signals-core').Signal<number|null>} */
  let activePR;

  beforeEach(() => {
    getDiff.mockReset();
    getPRFileDiff.mockReset();
    activePR = signal(null);
    selection = new SelectionModel({
      workingTree: makeWorkingTree(),
      activePR,
    });
  });

  afterEach(() => {
    selection[Symbol.dispose]?.();
  });

  it('same-path select re-requests diff', () => {
    selection.select('src/a.js', 'unstaged');
    expect(getDiff).toHaveBeenCalledWith('src/a.js', false);
    expect(selection.diffLoading.value).toBe(true);

    getDiff.mockClear();
    selection.select('src/a.js', 'unstaged');

    expect(getDiff).toHaveBeenCalledTimes(1);
    expect(getDiff).toHaveBeenCalledWith('src/a.js', false);
    expect(selection.diffLoading.value).toBe(true);
    expect(selection.activeDiff.value).toBeNull();
  });

  it('applyDiff ignores mismatched path', () => {
    selection.select('src/a.js', 'unstaged');
    selection.select('src/b.js', 'unstaged');
    expect(selection.activeFile.value).toBe('src/b.js');
    expect(selection.activeDiff.value).toBeNull();
    expect(selection.diffLoading.value).toBe(true);

    selection.applyDiff({ path: 'src/a.js', patch: 'stale' });

    expect(selection.activeDiff.value).toBeNull();
    expect(selection.diffLoading.value).toBe(true);

    selection.applyDiff({ path: 'src/b.js', patch: 'ok' });
    expect(selection.activeDiff.value).toEqual({ path: 'src/b.js', patch: 'ok' });
    expect(selection.diffLoading.value).toBe(false);
  });

  it('clear resets diffLoading', () => {
    selection.select('src/a.js', 'staged');
    expect(selection.diffLoading.value).toBe(true);
    expect(getDiff).toHaveBeenCalledWith('src/a.js', true);

    selection.clear();

    expect(selection.activeFile.value).toBeNull();
    expect(selection.activeSection.value).toBeNull();
    expect(selection.activeDiff.value).toBeNull();
    expect(selection.diffLoading.value).toBe(false);
  });

  it('selectFirstFromWorkingTree with empty tree clears loading', () => {
    selection.select('src/a.js', 'unstaged');
    expect(selection.diffLoading.value).toBe(true);

    selection.selectFirstFromWorkingTree();

    expect(selection.activeFile.value).toBeNull();
    expect(selection.diffLoading.value).toBe(false);
  });

  it('conflict selection skips getDiff', () => {
    selection.select('conflicted.js', 'conflict');

    expect(getDiff).not.toHaveBeenCalled();
    expect(getPRFileDiff).not.toHaveBeenCalled();
    expect(selection.diffLoading.value).toBe(false);
    expect(selection.activeFile.value).toBe('conflicted.js');
    expect(selection.activeSection.value).toBe('conflict');
  });

  it('toggleViewMode switches between diff and edit for unstaged files', () => {
    selection.select('src/a.js', 'unstaged');
    expect(selection.viewMode.value).toBe('diff');
    expect(selection.canEdit.value).toBe(true);

    selection.toggleViewMode();
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.isEditView.value).toBe(true);

    getDiff.mockClear();
    selection.toggleViewMode();
    expect(selection.viewMode.value).toBe('diff');
    expect(getDiff).toHaveBeenCalledWith('src/a.js', false);
  });

  it('select resets view mode to diff', () => {
    selection.select('src/a.js', 'unstaged');
    selection.toggleViewMode();
    expect(selection.viewMode.value).toBe('edit');

    selection.select('src/b.js', 'unstaged');
    expect(selection.viewMode.value).toBe('diff');
  });

  it('editorDirty clears on select, clear, and leaving edit mode', () => {
    selection.select('src/a.js', 'unstaged');
    selection.toggleViewMode();
    selection.editorDirty.value = true;
    expect(selection.editorDirty.value).toBe(true);

    selection.toggleViewMode();
    expect(selection.viewMode.value).toBe('diff');
    expect(selection.editorDirty.value).toBe(false);

    selection.toggleViewMode();
    selection.editorDirty.value = true;
    selection.select('src/b.js', 'unstaged');
    expect(selection.editorDirty.value).toBe(false);

    selection.toggleViewMode();
    selection.editorDirty.value = true;
    selection.clear();
    expect(selection.editorDirty.value).toBe(false);
  });

  it('openEditorAtLine enters edit mode with a one-shot goto line', () => {
    selection.select('src/a.js', 'unstaged');
    expect(selection.editorGotoLine.value).toBeNull();

    selection.openEditorAtLine(12);
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.isEditView.value).toBe(true);
    expect(selection.editorGotoLine.value).toBe(12);
  });

  it('openEditorAtLine no-ops when cannot edit or line is invalid', () => {
    selection.select('src/a.js', 'staged');
    selection.openEditorAtLine(3);
    expect(selection.viewMode.value).toBe('diff');
    expect(selection.editorGotoLine.value).toBeNull();

    selection.select('src/a.js', 'unstaged');
    selection.openEditorAtLine(0);
    expect(selection.viewMode.value).toBe('diff');
    expect(selection.editorGotoLine.value).toBeNull();

    selection.openEditorAtLine(NaN);
    expect(selection.editorGotoLine.value).toBeNull();
  });

  it('editorGotoLine clears on select, clear, and leaving edit mode', () => {
    selection.select('src/a.js', 'unstaged');
    selection.openEditorAtLine(5);
    expect(selection.editorGotoLine.value).toBe(5);

    selection.toggleViewMode();
    expect(selection.viewMode.value).toBe('diff');
    expect(selection.editorGotoLine.value).toBeNull();

    selection.openEditorAtLine(8);
    selection.select('src/b.js', 'unstaged');
    expect(selection.editorGotoLine.value).toBeNull();

    selection.openEditorAtLine(2);
    selection.clear();
    expect(selection.editorGotoLine.value).toBeNull();
  });

  it('openFromTerminal selects unstaged edit mode at a line', () => {
    selection.select('src/a.js', 'staged');
    selection.openFromTerminal('pkg/main.go', 7);
    expect(selection.activeFile.value).toBe('pkg/main.go');
    expect(selection.activeSection.value).toBe('unstaged');
    expect(selection.viewMode.value).toBe('edit');
    expect(selection.editorGotoLine.value).toBe(7);
    expect(selection.diffLoading.value).toBe(true);
  });

  it('openFromTerminal no-ops in PR mode', () => {
    activePR.value = 42;
    selection.openFromTerminal('src/x.js', 1);
    expect(selection.activeFile.value).toBeNull();
    activePR.value = null;
  });
});
