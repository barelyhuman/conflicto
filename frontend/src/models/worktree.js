import { createModel, signal, computed, effect } from '@preact/signals';
import { api } from '../wails.js';

/**
 * @typedef {{ path: string, branch: string, head: string, isMain: boolean, isCurrent: boolean }} WorktreeEntry
 */

/**
 * Git worktree domain: listed worktrees, path preview for new worktrees, remove.
 *
 * Pass `currentPath` from a repo/project model when available; otherwise the model
 * keeps its own `currentPath` signal via `setCurrentPath`.
 *
 * @param {{
 *   currentPath?: import('@preact/signals-core').Signal<string>,
 *   onError?: (title: string, message: string) => void,
 * }} [opts]
 */
export const WorktreeModel = createModel(({ currentPath: externalCurrentPath, onError } = {}) => {
  const currentPath = externalCurrentPath ?? signal('');
  const entries = signal(/** @type {WorktreeEntry[]} */ ([]));
  const previewPath = signal('');
  const previewHash = signal('');
  const previewLoading = signal(false);
  const previewActive = signal(false);

  const linkedCount = computed(
    () => entries.value.filter((wt) => !wt.isMain).length
  );

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  effect(() => {
    if (!previewActive.value) {
      previewPath.value = '';
      previewHash.value = '';
      previewLoading.value = false;
      return;
    }

    let cancelled = false;
    previewLoading.value = true;

    api.previewWorktreePath()
      .then((preview) => {
        if (cancelled) return;
        previewPath.value = preview?.path ?? '';
        previewHash.value = preview?.hash ?? '';
      })
      .catch(() => {
        if (cancelled) return;
        previewPath.value = '';
        previewHash.value = '';
      })
      .finally(() => {
        if (!cancelled) previewLoading.value = false;
      });

    return () => {
      cancelled = true;
    };
  });

  return {
    currentPath,
    entries,
    previewPath,
    previewHash,
    previewLoading,
    linkedCount,

    setCurrentPath(path) {
      this.currentPath.value = path ?? '';
    },

    /** Mirror `worktreesUpdated` from Go. */
    applyWorktrees(data) {
      this.entries.value = data?.worktrees ?? [];
    },

    async refresh() {
      try {
        const list = await api.getWorktrees();
        this.entries.value = list ?? [];
      } catch (err) {
        report('Worktree Error', err);
      }
    },

    startPreview() {
      previewActive.value = true;
    },

    stopPreview() {
      previewActive.value = false;
    },

    remove(path) {
      return api.removeWorktree(path).catch((err) => {
        report('Remove Worktree Error', err);
      });
    },
  };
});
