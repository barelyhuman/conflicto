import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const discardFile = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    discardFile: (...args) => discardFile(...args),
  },
}));

const { WorkingTreeModel } = await import('./workingTree.js');

describe('WorkingTreeModel', () => {
  let workingTree;

  beforeEach(() => {
    discardFile.mockReset();
    workingTree = new WorkingTreeModel();
  });

  afterEach(() => {
    workingTree[Symbol.dispose]?.();
  });

  it('discards every current unstaged path', async () => {
    workingTree.unstaged.value = [
      { path: 'tracked.txt', status: 'M' },
      { path: 'untracked.txt', status: '?' },
    ];
    discardFile.mockResolvedValue(undefined);

    await workingTree.discardAll();

    expect(discardFile).toHaveBeenNthCalledWith(1, 'tracked.txt');
    expect(discardFile).toHaveBeenNthCalledWith(2, 'untracked.txt');
  });

  it('stops after the first discard failure', async () => {
    workingTree.unstaged.value = [
      { path: 'first.txt', status: 'M' },
      { path: 'second.txt', status: 'M' },
    ];
    discardFile.mockRejectedValueOnce(new Error('failed'));

    await workingTree.discardAll();

    expect(discardFile).toHaveBeenCalledTimes(1);
  });
});
