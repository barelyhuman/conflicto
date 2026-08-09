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

  const isConflict = computed(
    () => activePR.value == null && activeSection.value === 'conflict'
  );
  const isUnstaged = computed(() => activeSection.value === 'unstaged');

  // Fetch diff when selection or active PR changes.
  effect(() => {
    const file = activeFile.value;
    const section = activeSection.value;
    const pr = activePR.value;
    if (!file) return;
    if (pr != null) {
      api.getPRFileDiff(pr, file);
    } else {
      api.getDiff(file, section === 'staged');
    }
  });

  return {
    activeFile,
    activeSection,
    activeDiff,
    isConflict,
    isUnstaged,
    workingTree,
    activePR,

    select(path, section) {
      this.activeFile.value = path;
      this.activeSection.value = section;
    },

    clear() {
      this.activeFile.value = null;
      this.activeSection.value = null;
      this.activeDiff.value = null;
    },

    applyDiff(data) {
      this.activeDiff.value = data ?? null;
    },

    /** Auto-select first working-tree file when nothing is selected. */
    selectFirstFromWorkingTreeIfNeeded() {
      if (this.activeFile.value) return;
      const next = workingTree.firstEntry();
      if (!next) return;
      this.activeFile.value = next.path;
      this.activeSection.value = next.section;
    },

    /** Restore selection to first working-tree entry (e.g. leaving PR mode). */
    selectFirstFromWorkingTree() {
      const next = workingTree.firstEntry();
      this.activeFile.value = next?.path ?? null;
      this.activeSection.value = next?.section ?? null;
      this.activeDiff.value = null;
    },

    /** Re-request diff for current selection (after refresh). */
    refetch() {
      const file = this.activeFile.value;
      const section = this.activeSection.value;
      const pr = activePR.value;
      if (!file) return;
      if (pr == null) {
        api.getDiff(file, section === 'staged');
      } else {
        api.getPRFileDiff(pr, file);
      }
    },
  };
});
