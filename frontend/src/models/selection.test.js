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
});
