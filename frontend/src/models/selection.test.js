import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionModel } from './selection.js';

const getDiff = vi.fn();

const api = {
  getDiff: (...args) => getDiff(...args),
};

function makeWorkingTree(first = null) {
  return {
    firstEntry: () => first,
  };
}

describe('SelectionModel diffLoading', () => {
  /** @type {InstanceType<typeof SelectionModel>} */
  let selection;

  beforeEach(() => {
    getDiff.mockReset();
    selection = new SelectionModel({
      workingTree: makeWorkingTree(),
      api,
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

  it('stores a diff on the scope that requested it', async () => {
    /** @type {((data: object) => void)[]} */
    const replies = [];

    getDiff.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
    selection.setScope('/a');
    selection.select('a.go', 'unstaged');
    selection.setScope('/b');
    selection.select('a.go', 'unstaged');
    replies[0]({ path: 'a.go', patch: 'from-a' });
    await Promise.resolve();
    expect(selection.activeDiff.value).toBeNull();

    selection.setScope('/a');
    selection.select('a.go', 'unstaged');
    expect(selection.activeDiff.value).toEqual({ path: 'a.go', patch: 'from-a' });
  });

  it('reports a diff failure for the current scope and drops one from an old scope', async () => {
    const onError = vi.fn();
    const rejects = [];
    const failing = new SelectionModel({
      workingTree: makeWorkingTree(),
      api: {
        getDiff: () => new Promise((_, reject) => {
          rejects.push(reject);
        }),
      },
      onError,
    });

    failing.setScope('/a');
    failing.select('a.go', 'unstaged');
    failing.setScope('/b');
    failing.select('b.go', 'unstaged');
    rejects[0](new Error('from-a'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).not.toHaveBeenCalled();
    expect(failing.activeFile.value).toBe('b.go');
    expect(failing.diffLoading.value).toBe(true);

    rejects[1](new Error('no repo'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledWith('Diff Error', 'no repo');
    expect(failing.diffLoading.value).toBe(false);

    failing[Symbol.dispose]?.();
  });

  it('conflict selection skips getDiff', () => {
    selection.select('conflicted.js', 'conflict');

    expect(getDiff).not.toHaveBeenCalled();
    expect(selection.diffLoading.value).toBe(false);
    expect(selection.activeFile.value).toBe('conflicted.js');
    expect(selection.activeSection.value).toBe('conflict');
  });
});
