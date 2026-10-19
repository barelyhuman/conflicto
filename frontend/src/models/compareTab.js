import { createModel, signal, computed } from '@preact/signals';
import { api as defaultApi } from '../wails.js';
import { compareTabPath } from './tabs.js';

const errText = (err) => err?.message ?? String(err);

/**
 * State of one compare tab: the working tree of the active worktree diffed
 * against a ref (or the merge base of HEAD and the ref). The ref is resolved
 * to a commit once per load; patches are fetched against that commit so the
 * file list and the patches always agree, even if the branch moves.
 *
 * @typedef {{ path: string, oldPath?: string, status: string, additions: number, deletions: number, untracked?: boolean }} CompareFileEntry
 *
 * @param {{ ref: string, mergeBase?: boolean, api?: typeof defaultApi }} opts
 */
export const CompareTabModel = createModel(({ ref, mergeBase = false, api = defaultApi }) => {
  const baseSHA = signal('');
  const files = signal(/** @type {CompareFileEntry[]} */ ([]));
  const selectedPath = signal(/** @type {string|null} */ (null));
  /** path -> { path, patch } */
  const patches = signal(/** @type {Record<string, any>} */ ({}));
  const loadingPatch = signal(/** @type {string|null} */ (null));
  const loading = signal(true);
  const error = signal(/** @type {string|null} */ (null));
  const patchError = signal(/** @type {string|null} */ (null));

  let disposed = false;
  let loadedOnce = false;
  let loadSeq = 0;

  const selectedIndex = computed(() => files.value.findIndex((f) => f.path === selectedPath.value));

  const activeDiff = computed(() => {
    const path = selectedPath.value;
    const cache = patches.value;

    return path ? (cache[path] ?? null) : null;
  });

  const diffLoading = computed(() => {
    const path = selectedPath.value;
    const pending = loadingPatch.value;
    const cache = patches.value;

    return path != null && pending === path && !cache[path];
  });

  const totals = computed(() =>
    files.value.reduce(
      (acc, f) => ({ additions: acc.additions + (f.additions ?? 0), deletions: acc.deletions + (f.deletions ?? 0) }),
      { additions: 0, deletions: 0 },
    )
  );

  function entryFor(path) {
    return files.peek().find((f) => f.path === path) ?? null;
  }

  /** Fetch one patch; `force` replaces a cached one (refresh keeps showing the old patch meanwhile). */
  async function fetchPatch(path, { force = false } = {}) {
    const base = baseSHA.peek();

    if (!base || (!force && patches.peek()[path])) return;
    const entry = entryFor(path);
    loadingPatch.value = path;
    patchError.value = null;

    try {
      const data = await api.getCompareFilePatch(base, path, entry?.oldPath ?? '', Boolean(entry?.untracked));

      if (disposed || base !== baseSHA.peek()) return;
      patches.value = { ...patches.peek(), [path]: { ...(data ?? {}), path } };
    } catch (err) {
      if (!disposed) patchError.value = errText(err);
    } finally {
      if (!disposed && loadingPatch.peek() === path) loadingPatch.value = null;
    }
  }

  function selectPath(path) {
    if (!path) return undefined;
    selectedPath.value = path;
    patchError.value = null;

    return fetchPatch(path);
  }

  async function loadFiles({ silent = false } = {}) {
    const seq = ++loadSeq;

    if (!silent) loading.value = true;

    try {
      const res = await api.getCompareFiles(ref, mergeBase);

      if (disposed || seq !== loadSeq) return;
      const list = res?.files ?? [];
      const sel = selectedPath.peek();

      // Patches of the old base are stale; keep the selected one on screen until it is refetched.
      patches.value = sel && res?.baseSHA === baseSHA.peek() && patches.peek()[sel] ? { [sel]: patches.peek()[sel] } : {};
      baseSHA.value = res?.baseSHA ?? '';
      files.value = list;
      error.value = null;

      if (sel && list.some((f) => f.path === sel)) {
        await fetchPatch(sel, { force: true });
      } else if (list.length > 0) {
        await selectPath(list[0].path);
      } else {
        selectedPath.value = null;
      }
    } catch (err) {
      // A failed background refresh must not blank a tab that already has data.
      if (!disposed && seq === loadSeq && (!silent || !baseSHA.peek())) error.value = errText(err);
    } finally {
      if (!disposed && seq === loadSeq) loading.value = false;
    }
  }

  return {
    ref,
    mergeBase,
    baseSHA,
    files,
    selectedPath,
    selectedIndex,
    activeDiff,
    diffLoading,
    totals,
    loading,
    error,
    patchError,

    /** Fetch once; later calls are no-ops (use `refresh`). */
    async load() {
      if (loadedOnce) return;
      loadedOnce = true;
      await loadFiles();
    },

    /** First visit loads; a revisit refreshes in the background (the working tree may have changed). */
    ensureFresh() {
      return loadedOnce ? loadFiles({ silent: true }) : this.load();
    },

    /** Re-resolve the ref and re-list files; `silent` keeps the current view while loading. */
    refresh({ silent = false } = {}) {
      loadedOnce = true;

      return loadFiles({ silent });
    },

    selectFile(path) {
      return selectPath(path);
    },

    /** Step the selected file by `delta` (wraps). */
    stepFile(delta) {
      const list = files.peek();

      if (list.length === 0) return;
      const idx = selectedIndex.peek();
      const at = idx < 0 ? (delta > 0 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length;
      selectPath(list[at].path);
    },

    /** Both sides of a file, for expanding unchanged context. */
    loadContents(path) {
      const base = baseSHA.peek();

      return api.getCompareFileContents(base, path, entryFor(path)?.oldPath ?? '');
    },

    /** Late responses after disposal are dropped. */
    markDisposed() {
      disposed = true;
    },
  };
});

/**
 * Compare tab state, keyed by scope + tab path, released when the tab is
 * discarded for good.
 *
 * @param {{ api?: typeof defaultApi }} [opts]
 */
export function createCompareTabRegistry({ api = defaultApi } = {}) {
  /** @type {Map<string, InstanceType<typeof CompareTabModel>>} */
  const entries = new Map();

  const key = (scope, path) => `${scope ?? ''}\u0000${path}`;

  function dispose(model) {
    model.markDisposed();
    model[Symbol.dispose]?.();
  }

  const registry = {
    /** Existing or new model for this tab (not loaded yet: see `ensureFresh`). */
    get(scope, ref, mergeBase = false) {
      const k = key(scope, compareTabPath(ref, mergeBase));
      let model = entries.get(k);

      if (!model) {
        model = new CompareTabModel({ ref, mergeBase, api });
        entries.set(k, model);
      }

      return model;
    },

    peek(scope, path) {
      return entries.get(key(scope, path)) ?? null;
    },

    release(scope, path) {
      const k = key(scope, path);
      const model = entries.get(k);

      if (!model) return;
      entries.delete(k);
      dispose(model);
    },

    /** Dispose models when their `compare` tab is discarded for good. @returns {() => void} */
    bindTabs(tabs) {
      return tabs.onDiscard((scope, tab) => {
        if (tab.kind === 'compare') registry.release(scope, tab.path);
      });
    },
  };

  return registry;
}

/** App-wide compare tab registry. */
export const compareTabs = createCompareTabRegistry();
