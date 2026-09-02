import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';

const previewWorktreePath = vi.fn();
const getWorktrees = vi.fn();
const removeWorktree = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    previewWorktreePath: (...args) => previewWorktreePath(...args),
    getWorktrees: (...args) => getWorktrees(...args),
    removeWorktree: (...args) => removeWorktree(...args),
  },
}));

const { WorktreeModel } = await import('./worktree.js');

describe('WorktreeModel', () => {
  /** @type {InstanceType<typeof WorktreeModel>} */
  let worktree;

  beforeEach(() => {
    previewWorktreePath.mockReset();
    getWorktrees.mockReset();
    removeWorktree.mockReset();
    worktree = new WorktreeModel();
  });

  afterEach(() => {
    worktree[Symbol.dispose]?.();
  });

  it('applyWorktrees mirrors event payload', () => {
    worktree.applyWorktrees({
      worktrees: [{ path: '/repo', branch: 'main', head: 'abc', isMain: true, isCurrent: true }],
    });
    expect(worktree.entries.value).toHaveLength(1);
    expect(worktree.linkedCount.value).toBe(0);
  });

  it('uses external currentPath signal when provided', () => {
    const repoPath = signal('/repo/main');
    const linked = new WorktreeModel({ currentPath: repoPath });
    repoPath.value = '/repo/wt';
    expect(linked.currentPath.value).toBe('/repo/wt');
    linked[Symbol.dispose]?.();
  });

  describe('preview', () => {
    it('clears preview when stopped', () => {
      previewWorktreePath.mockResolvedValue({ path: '/tmp/wt', hash: 'abc' });
      worktree.startPreview();
      worktree.stopPreview();

      expect(worktree.previewPath.value).toBe('');
      expect(worktree.previewHash.value).toBe('');
      expect(worktree.previewLoading.value).toBe(false);
    });

    it('loads preview when started', async () => {
      previewWorktreePath.mockResolvedValue({ path: '/tmp/wt', hash: 'abc' });

      worktree.startPreview();
      expect(worktree.previewLoading.value).toBe(true);

      await vi.waitFor(() => {
        expect(worktree.previewLoading.value).toBe(false);
      });

      expect(previewWorktreePath).toHaveBeenCalledTimes(1);
      expect(worktree.previewPath.value).toBe('/tmp/wt');
      expect(worktree.previewHash.value).toBe('abc');
    });

    it('clears preview on failure', async () => {
      previewWorktreePath.mockRejectedValue(new Error('fail'));

      worktree.startPreview();

      await vi.waitFor(() => {
        expect(worktree.previewLoading.value).toBe(false);
      });

      expect(worktree.previewPath.value).toBe('');
      expect(worktree.previewHash.value).toBe('');
    });
  });
});
