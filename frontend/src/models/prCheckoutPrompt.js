import { createModel, signal, effect } from '@preact/signals';
import { api } from '../wails.js';

/** @typedef {null | 'local' | 'worktree'} CheckoutMode */

export const PRCheckoutPromptModel = createModel(() => {
  /** @type {import('@preact/signals-core').Signal<CheckoutMode>} */
  const mode = signal(null);
  const worktreePath = signal('');
  const worktreeHash = signal('');
  const worktreePreviewLoading = signal(false);

  effect(() => {
    if (mode.value !== 'worktree') {
      worktreePath.value = '';
      worktreeHash.value = '';
      worktreePreviewLoading.value = false;
      return;
    }

    let cancelled = false;
    worktreePreviewLoading.value = true;

    api.previewWorktreePath()
      .then((preview) => {
        if (cancelled) return;
        worktreePath.value = preview?.path ?? '';
        worktreeHash.value = preview?.hash ?? '';
      })
      .catch(() => {
        if (cancelled) return;
        worktreePath.value = '';
        worktreeHash.value = '';
      })
      .finally(() => {
        if (!cancelled) worktreePreviewLoading.value = false;
      });

    return () => {
      cancelled = true;
    };
  });

  return {
    mode,
    worktreePath,
    worktreeHash,
    worktreePreviewLoading,

    setMode(next) {
      this.mode.value = next;
    },

    resetMode() {
      this.mode.value = null;
    },
  };
});
