import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const previewWorktreePath = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    previewWorktreePath: (...args) => previewWorktreePath(...args),
  },
}));

const { PRCheckoutPromptModel } = await import('./prCheckoutPrompt.js');

describe('PRCheckoutPromptModel worktree preview', () => {
  /** @type {InstanceType<typeof PRCheckoutPromptModel>} */
  let model;

  beforeEach(() => {
    previewWorktreePath.mockReset();
    model = new PRCheckoutPromptModel();
  });

  afterEach(() => {
    model[Symbol.dispose]?.();
  });

  it('clears preview when leaving worktree mode', () => {
    previewWorktreePath.mockResolvedValue({ path: '/tmp/wt', hash: 'abc' });
    model.setMode('worktree');
    model.setMode(null);

    expect(model.worktreePath.value).toBe('');
    expect(model.worktreeHash.value).toBe('');
    expect(model.worktreePreviewLoading.value).toBe(false);
  });

  it('loads preview when entering worktree mode', async () => {
    previewWorktreePath.mockResolvedValue({ path: '/tmp/wt', hash: 'abc' });

    model.setMode('worktree');
    expect(model.worktreePreviewLoading.value).toBe(true);

    await vi.waitFor(() => {
      expect(model.worktreePreviewLoading.value).toBe(false);
    });

    expect(previewWorktreePath).toHaveBeenCalledTimes(1);
    expect(model.worktreePath.value).toBe('/tmp/wt');
    expect(model.worktreeHash.value).toBe('abc');
  });

  it('clears preview on preview failure', async () => {
    previewWorktreePath.mockRejectedValue(new Error('fail'));

    model.setMode('worktree');

    await vi.waitFor(() => {
      expect(model.worktreePreviewLoading.value).toBe(false);
    });

    expect(model.worktreePath.value).toBe('');
    expect(model.worktreeHash.value).toBe('');
  });
});
