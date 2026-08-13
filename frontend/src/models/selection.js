import { createModel, signal, computed, effect } from '@preact/signals';
import { api } from '../wails.js';

/**
 * File / section / diff selection and diff fetching.
 *
 * @param {{
 *   workingTree: InstanceType<typeof import('./workingTree.js').WorkingTreeModel>,
 *   activePR: import('@preact/signals-core').Signal<number|null>,
 * }} opts
 */
export const SelectionModel = createModel(({ workingTree, activePR }) => {
  const activeFile = signal(/** @type {string|null} */ (null));
  /** @type {import('@preact/signals-core').Signal<null | 'conflict' | 'staged' | 'unstaged' | 'pr'>} */
  const activeSection = signal(null);
  const activeDiff = signal(/** @type {{ path?: string, patch?: string }|null} */ (null));
  /** True while a diff request is in flight for the current selection. */
  const diffLoading = signal(false);
  const showFullDiff = signal(false);

  const isConflict = computed(
    () => activePR.value == null && activeSection.value === 'conflict'
  );
  const isUnstaged = computed(() => activeSection.value === 'unstaged');

  function requestDiff(file, section) {
    if (!file) {
      diffLoading.value = false;
      return;
    }
    diffLoading.value = true;
    const pr = activePR.peek();
    if (pr != null) {
      api.getPRFileDiff(pr, file);
    } else {
      api.getDiff(file, section === 'staged');
    }
  }

  // Fetch when the selected file or active PR changes (path change path).
  effect(() => {
    const file = activeFile.value;
    const section = activeSection.value;
    // Subscribe to PR so entering/leaving PR mode re-fetches.
    activePR.value;
    if (!file) {
      diffLoading.value = false;
      return;
    }
    requestDiff(file, section);
  });

  return {
    activeFile,
    activeSection,
    activeDiff,
    diffLoading,
    showFullDiff,
    isConflict,
    isUnstaged,
    workingTree,
    activePR,

    select(path, section) {
      const same =
        this.activeFile.peek() === path && this.activeSection.peek() === section;
      // Drop stale viewer content immediately so we never flash the previous file.
      this.activeDiff.value = null;
      this.diffLoading.value = true;
      this.showFullDiff.value = false;
      if (same) {
        // Same path is a signal no-op — effect won't re-run; fetch explicitly.
        requestDiff(path, section);
        return;
      }
      this.activeFile.value = path;
      this.activeSection.value = section;
    },

    clear() {
      this.activeFile.value = null;
      this.activeSection.value = null;
      this.activeDiff.value = null;
      this.diffLoading.value = false;
      this.showFullDiff.value = false;
    },

    toggleShowFullDiff() {
      this.showFullDiff.value = !this.showFullDiff.value;
    },

    applyDiff(data) {
      const path = data?.path ?? null;
      // Ignore late responses for a file the user already navigated away from.
      if (path != null && this.activeFile.peek() != null && path !== this.activeFile.peek()) {
        return;
      }
      this.activeDiff.value = data ?? null;
      this.diffLoading.value = false;
    },

    /** Auto-select first working-tree file when nothing is selected. */
    selectFirstFromWorkingTreeIfNeeded() {
      if (this.activeFile.value) return;
      const next = workingTree.firstEntry();
      if (!next) return;
      this.select(next.path, next.section);
    },

    /** Restore selection to first working-tree entry (e.g. leaving PR mode). */
    selectFirstFromWorkingTree() {
      const next = workingTree.firstEntry();
      if (!next) {
        this.clear();
        return;
      }
      this.select(next.path, next.section);
    },

    /** Re-request diff for current selection (after refresh). */
    refetch() {
      const file = this.activeFile.value;
      const section = this.activeSection.value;
      if (!file) return;
      this.activeDiff.value = null;
      requestDiff(file, section);
    },
  };
});
