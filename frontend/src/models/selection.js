import { createModel, signal, computed, effect } from '@preact/signals';
import { api as defaultApi } from '../wails.js';

/**
 * Working-tree diff for the open tab.
 *
 * The visible file follows the active diff tab. The patch is remembered per
 * worktree scope, so a result that arrives after a switch is stored for the
 * scope that requested it and is not painted into the scope now on screen.
 *
 * @param {{
 *   workingTree: InstanceType<typeof import('./workingTree.js').WorkingTreeModel>,
 *   api?: typeof defaultApi,
 *   onError?: (title: string, message: string) => void,
 * }} opts
 */
export const SelectionModel = createModel(({ workingTree, api = defaultApi, onError }) => {
  const activeFile = signal(/** @type {string|null} */ (null));
  /** @type {import('@preact/signals-core').Signal<null | 'conflict' | 'staged' | 'unstaged'>} */
  const activeSection = signal(null);
  const activeDiff = signal(/** @type {{ path?: string, patch?: string }|null} */ (null));
  /** True while a diff request is in flight for the current selection and nothing is stored yet. */
  const diffLoading = signal(false);
  const showFullDiff = signal(false);

  const isConflict = computed(() => activeSection.value === 'conflict');
  const isUnstaged = computed(() => activeSection.value === 'unstaged');

  /** @type {string | null} */
  let scopeKey = null;
  let seq = 0;
  /** Latest request token per scope+section+path. */
  const latest = new Map();
  /** Last patch returned for that key. */
  const remembered = new Map();

  function cacheKey(scope, section, path) {
    return `${scope ?? ''}\0${section ?? ''}\0${path ?? ''}`;
  }

  function rememberedDiff(section, path) {
    return remembered.get(cacheKey(scopeKey, section, path)) ?? null;
  }

  function requestDiff(file, section) {
    if (!file) {
      diffLoading.value = false;

      return;
    }

    // ConflictViewer fetches stages via GetConflictFile; skip the unused patch.
    if (section === 'conflict') {
      diffLoading.value = false;

      return;
    }

    const scope = scopeKey;
    const key = cacheKey(scope, section, file);
    const token = ++seq;

    latest.set(key, token);

    const hit = remembered.get(key) ?? null;

    if (hit) activeDiff.value = hit;
    else diffLoading.value = true;

    Promise.resolve(api.getDiff(file, section === 'staged'))
      .then((data) => {
        if (latest.get(key) !== token) return;
        if (data?.path) remembered.set(key, data);
        if (scopeKey !== scope || activeFile.peek() !== file || activeSection.peek() !== section) return;
        if (!data?.path) return;
        activeDiff.value = data;
        diffLoading.value = false;
      })
      .catch((err) => {
        if (latest.get(key) !== token || scopeKey !== scope || activeFile.peek() !== file) return;
        diffLoading.value = false;
        onError?.('Diff Error', err?.message ?? String(err));
      });
  }

  // Fetch when the selected file changes (path change path).
  effect(() => {
    const file = activeFile.value;
    const section = activeSection.value;

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

    /** Swap the visible diff to this worktree. Other scopes keep their patches. */
    setScope(next) {
      const key = next || null;

      if (scopeKey === key) return;
      scopeKey = key;
      this.activeFile.value = null;
      this.activeSection.value = null;
      this.activeDiff.value = null;
      this.diffLoading.value = false;
      this.showFullDiff.value = false;
    },

    select(path, section) {
      const same = this.activeFile.peek() === path && this.activeSection.peek() === section;
      const hit = section === 'conflict' ? null : rememberedDiff(section, path);

      this.activeDiff.value = hit;
      this.diffLoading.value = section !== 'conflict' && !hit;
      this.showFullDiff.value = false;

      if (same) {
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

      if (path) remembered.set(cacheKey(scopeKey, this.activeSection.peek(), path), data);
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

    /** Restore selection to first working-tree entry . */
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
      remembered.delete(cacheKey(scopeKey, section, file));
      this.activeDiff.value = null;
      requestDiff(file, section);
    },
  };
});
