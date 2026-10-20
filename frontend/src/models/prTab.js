import { createModel, signal, computed } from '@preact/signals';
import { api as defaultApi } from '../wails.js';
import { ReviewModel } from './review.js';
import { activePatch, beginPatch, dropPatches, emptyFileSet, endPatch, fileIndex, patchPending, putPatch, stepPath, withList } from './fileSet.js';

const errText = (err) => err?.message ?? String(err);

/**
 * State of one pull-request tab: details, changed files, per-path patch cache,
 * review comments, timeline, and a per-tab pending-review model. Everything is
 * fetched per PR number through request/response api calls (no global events),
 * so rejections surface as error states instead of hanging spinners.
 *
 * @typedef {{ path: string, status?: string, additions?: number, deletions?: number }} PRFileEntry
 *
 * @param {{
 *   number: number,
 *   api?: typeof defaultApi,
 *   onError?: (title: string, message: string) => void,
 *   readClipboard?: () => Promise<string>,
 * }} opts
 */
export const PRTabModel = createModel(
  ({ number, api = defaultApi, onError, readClipboard }) => {
    const details = signal(/** @type {any} */ (null));
    const fileSet = signal(emptyFileSet());
    const comments = signal(/** @type {any[]} */ ([]));
    const timeline = signal(/** @type {any[]} */ ([]));
    const view = signal(/** @type {'files'|'conversation'} */ ('files'));
    const loading = signal(true);
    const filesLoading = signal(true);
    const timelineLoading = signal(true);
    const error = signal(/** @type {string|null} */ (null));
    const filesError = signal(/** @type {string|null} */ (null));
    const timelineError = signal(/** @type {string|null} */ (null));
    const patchError = signal(/** @type {string|null} */ (null));

    let disposed = false;
    let loadedOnce = false;

    const files = computed(() => fileSet.value.list);
    const selectedPath = computed(() => fileSet.value.selected);
    const selectedIndex = computed(() => fileIndex(fileSet.value));
    const activeDiff = computed(() => activePatch(fileSet.value));
    const diffLoading = computed(() => patchPending(fileSet.value));

    const checks = computed(() => details.value?.checks ?? null);

    function report(title, err) {
      onError?.(title, errText(err));
    }

    async function loadDetails({ silent = false } = {}) {
      if (!silent) loading.value = true;

      try {
        const d = await api.getPRDetails(number);

        if (disposed) return;
        details.value = d ?? null;
        error.value = d ? null : 'Pull request not found.';
      } catch (err) {
        if (disposed) return;

        // A failed background poll must not blank a tab that already has data.
        if (!silent || !details.peek()) error.value = errText(err);
      } finally {
        if (!disposed) loading.value = false;
      }
    }

    async function loadFiles() {
      filesLoading.value = true;

      try {
        const list = (await api.getPRFilesList(number)) ?? [];

        if (disposed) return;
        fileSet.value = withList(fileSet.peek(), list);
        filesError.value = null;

        const sel = fileSet.peek().selected;

        if (sel && !fileSet.peek().patches[sel]) await fetchPatch(sel);
      } catch (err) {
        if (!disposed) filesError.value = errText(err);
      } finally {
        if (!disposed) filesLoading.value = false;
      }
    }

    async function loadComments() {
      try {
        const list = await api.getPRReviewComments(number);

        if (!disposed) comments.value = Array.isArray(list) ? list : [];
      } catch {
        // Inline comments are decoration; the files view works without them.
      }
    }

    async function loadTimeline() {
      timelineLoading.value = true;

      try {
        const list = await api.getPRTimeline(number);

        if (disposed) return;
        timeline.value = Array.isArray(list) ? list : [];
        timelineError.value = null;
      } catch (err) {
        if (!disposed) timelineError.value = errText(err);
      } finally {
        if (!disposed) timelineLoading.value = false;
      }
    }

    async function fetchPatch(path) {
      if (fileSet.peek().patches[path]) return;
      fileSet.value = beginPatch(fileSet.peek(), path);
      patchError.value = null;

      try {
        const data = await api.getPRFilePatch(number, path);

        if (disposed) return;
        fileSet.value = putPatch(fileSet.peek(), path, { ...(data ?? {}), path });
      } catch (err) {
        if (!disposed) patchError.value = errText(err);
      } finally {
        if (!disposed) fileSet.value = endPatch(fileSet.peek(), path);
      }
    }

    function selectPath(path) {
      if (!path) return undefined;
      patchError.value = null;
      fileSet.value = { ...fileSet.peek(), selected: path };

      return fetchPatch(path);
    }

    // Commenting or submitting changes what the PR shows; refresh what it affects.
    const reviewApi = {
      ...api,
      postPRComment: async (...args) => {
        const res = await api.postPRComment(...args);
        loadComments();

        return res;
      },
      submitReview: async (...args) => {
        const res = await api.submitReview(...args);
        loadComments();
        loadTimeline();

        return res;
      },
    };

    const review = new ReviewModel({ api: reviewApi, onError, readClipboard });

    return {
      number,
      review,
      details,
      files,
      comments,
      timeline,
      selectedPath,
      selectedIndex,
      activeDiff,
      diffLoading,
      checks,
      view,
      loading,
      filesLoading,
      timelineLoading,
      error,
      filesError,
      timelineError,
      patchError,

      /**
       * Fetch everything once; later calls are no-ops (use `refresh`).
       * Review drafts load after the file list so line checks see the PR file cache.
       */
      async load() {
        if (loadedOnce) return;
        loadedOnce = true;
        await Promise.all([loadDetails(), loadFiles(), loadComments(), loadTimeline()]);
        await review.load(number);
      },

      /** Re-fetch everything (patches are dropped; head may have moved). */
      async refresh() {
        fileSet.value = dropPatches(fileSet.peek());
        loadedOnce = true;
        await Promise.all([loadDetails(), loadFiles(), loadComments(), loadTimeline()]);
        await review.load(number);
      },

      /** Header fields only; a failed refresh keeps the details already on screen. */
      refreshDetails() {
        return loadDetails({ silent: true });
      },

      selectFile(path) {
        return selectPath(path);
      },

      /** Step the selected file by `delta` (wraps). */
      stepFile(delta) {
        const path = stepPath(fileSet.peek().list, fileSet.peek().selected, delta);

        if (path) selectPath(path);
      },

      setView(next) {
        view.value = next === 'conversation' ? 'conversation' : 'files';
      },

      /** Push a fresh checks summary (monitor event) into the details. */
      applyChecks(summary) {
        const d = details.peek();

        if (d && summary) details.value = { ...d, checks: summary };
      },

      /** The PR now has a local worktree. */
      setWorktreePath(path) {
        const d = details.peek();

        if (d) details.value = { ...d, worktreePath: path || '' };
      },

      refreshComments: loadComments,

      /** Late responses after disposal are dropped. */
      markDisposed() {
        disposed = true;
      },

      report,
    };
  }
);

/**
 * PR tab state lives outside the editor tab list, keyed by scope + PR number,
 * so moving a tab from the origin scope into the worktree scope (`rekey`)
 * keeps everything that was already fetched.
 *
 * @param {{ api?: typeof defaultApi, onError?: (title: string, message: string) => void }} [opts]
 */
export function createPRTabRegistry({ api = defaultApi, onError } = {}) {
  /** @type {Map<string, InstanceType<typeof PRTabModel>>} */
  const entries = new Map();
  let errorSink = onError;

  const key = (scope, number) => `${scope ?? ''}\u0000${number}`;

  function dispose(model) {
    model.markDisposed();
    model.review[Symbol.dispose]?.();
    model[Symbol.dispose]?.();
  }

  const registry = {
    /** Route model errors (toasts) to the app. */
    setOnError(fn) {
      errorSink = fn;
    },

    /** Existing or new model for this tab; a new one starts loading. */
    get(scope, number) {
      const k = key(scope, number);
      let model = entries.get(k);

      if (!model) {
        model = new PRTabModel({
          number,
          api,
          onError: (t, m) => errorSink?.(t, m),
        });
        entries.set(k, model);
        model.load();
      }

      return model;
    },

    peek(scope, number) {
      return entries.get(key(scope, number)) ?? null;
    },

    /** Tab moved between scopes: keep the model. */
    rekey(number, fromScope, toScope) {
      const from = key(fromScope, number);
      const to = key(toScope, number);
      const model = entries.get(from);

      if (!model || from === to) return model ?? null;
      const existing = entries.get(to);

      if (existing) dispose(existing);
      entries.delete(from);
      entries.set(to, model);

      return model;
    },

    release(scope, number) {
      const k = key(scope, number);
      const model = entries.get(k);

      if (!model) return;
      entries.delete(k);
      dispose(model);
    },

    /** Models currently alive (all scopes). */
    all() {
      return [...entries.values()];
    },

    /** Dispose models when their `pr` tab is discarded for good. @returns {() => void} */
    bindTabs(tabs) {
      return tabs.onDiscard((scope, tab) => {
        if (tab.kind === 'pr') registry.release(scope, tab.number);
      });
    },
  };

  return registry;
}

/** App-wide PR tab registry. */
export const prTabs = createPRTabRegistry();
