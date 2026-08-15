import { createModel, signal, computed, effect } from '@preact/signals';
import { api } from '../wails.js';

/** @typedef {{
 *   number: number,
 *   pullRequestId: string,
 *   reviewDecision: string,
 *   viewerReviewState: string,
 *   viewerReviewSubmittedAt: string,
 * }} PRReviewSnapshot */

/** @typedef {{ path: string, viewerViewedState: string }} PRFileViewedSnapshot */

/**
 * Pull request review + per-file viewed state for the authenticated GitHub viewer.
 *
 * @param {{
 *   activePR: import('@preact/signals-core').Signal<number|null>,
 *   onError?: (title: string, message: string) => void,
 * }} opts
 */
export const PRReviewModel = createModel(({ activePR, onError }) => {
  const reviewState = signal(/** @type {PRReviewSnapshot|null} */ (null));
  const viewedStates = signal(/** @type {PRFileViewedSnapshot[]} */ ([]));
  const reviewLoading = signal(false);
  const viewedLoading = signal(false);
  const reviewSubmitting = signal(false);
  const viewedMutating = signal(false);

  const reviewDecision = computed(() => reviewState.value?.reviewDecision ?? '');
  const viewerReviewState = computed(() => reviewState.value?.viewerReviewState ?? '');
  const viewerReviewSubmittedAt = computed(
    () => reviewState.value?.viewerReviewSubmittedAt ?? ''
  );
  const pullRequestId = computed(() => reviewState.value?.pullRequestId ?? '');
  const isViewerApproved = computed(() => viewerReviewState.value === 'APPROVED');
  const isViewerChangesRequested = computed(
    () => viewerReviewState.value === 'CHANGES_REQUESTED'
  );
  const hasViewerReview = computed(() => viewerReviewState.value !== '');
  const isReviewLoading = computed(() => reviewLoading.value || reviewSubmitting.value);
  const isViewedLoading = computed(() => viewedLoading.value || viewedMutating.value);

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  async function loadAll(number) {
    reviewLoading.value = true;
    viewedLoading.value = true;
    try {
      const [state, files] = await Promise.all([
        api.getPRReviewState(number),
        api.getPRFileViewedStates(number),
      ]);
      if (activePR.peek() !== number) return;
      applyReviewState(state);
      applyFileViewedStates({ number, files });
    } catch (err) {
      if (activePR.peek() === number) {
        reviewLoading.value = false;
        viewedLoading.value = false;
      }
      report('PR Review Load Error', err);
    }
  }

  effect(() => {
    const number = activePR.value;
    if (number == null) {
      clear();
      return;
    }
    loadAll(number);
  });

  function applyReviewState(data) {
    const number = data?.number;
    if (number == null) return;
    const active = activePR.peek();
    if (active != null && active !== number) return;

    reviewState.value = {
      number,
      pullRequestId: data.pullRequestId ?? '',
      reviewDecision: data.reviewDecision ?? '',
      viewerReviewState: data.viewerReviewState ?? '',
      viewerReviewSubmittedAt: data.viewerReviewSubmittedAt ?? '',
    };
    reviewLoading.value = false;
    reviewSubmitting.value = false;
  }

  function applyFileViewedStates(data) {
    const number = data?.number;
    if (number == null) return;
    const active = activePR.peek();
    if (active != null && active !== number) return;

    viewedStates.value = Array.isArray(data.files) ? data.files : [];
    viewedLoading.value = false;
    viewedMutating.value = false;
  }

  function clear() {
    reviewState.value = null;
    viewedStates.value = [];
    reviewLoading.value = false;
    viewedLoading.value = false;
    reviewSubmitting.value = false;
    viewedMutating.value = false;
  }

  return {
    activePR,
    reviewState,
    viewedStates,
    reviewLoading,
    viewedLoading,
    reviewSubmitting,
    viewedMutating,
    reviewDecision,
    viewerReviewState,
    viewerReviewSubmittedAt,
    pullRequestId,
    isViewerApproved,
    isViewerChangesRequested,
    hasViewerReview,
    isReviewLoading,
    isViewedLoading,

    applyReviewState,
    applyFileViewedStates,
    clear,

    viewedStateFor(path) {
      const entry = this.viewedStates.value.find((f) => f.path === path);
      return entry?.viewerViewedState ?? 'UNVIEWED';
    },

    isFileViewed(path) {
      return this.viewedStateFor(path) === 'VIEWED';
    },

    isFileDismissed(path) {
      return this.viewedStateFor(path) === 'DISMISSED';
    },

    async refresh() {
      const number = activePR.peek();
      if (number == null) return;
      await loadAll(number);
    },

    async markViewed(path) {
      const number = activePR.peek();
      if (number == null) return;
      const filePath = String(path ?? '').trim();
      if (!filePath) return;

      viewedMutating.value = true;
      try {
        await api.markPRFileViewed(number, filePath);
      } catch (err) {
        viewedMutating.value = false;
        report('Mark Viewed Error', err);
      }
    },

    async unmarkViewed(path) {
      const number = activePR.peek();
      if (number == null) return;
      const filePath = String(path ?? '').trim();
      if (!filePath) return;

      viewedMutating.value = true;
      try {
        await api.unmarkPRFileViewed(number, filePath);
      } catch (err) {
        viewedMutating.value = false;
        report('Unmark Viewed Error', err);
      }
    },

    async submitReview(action, body = '') {
      const number = activePR.peek();
      if (number == null) return;

      reviewSubmitting.value = true;
      try {
        await api.submitPRReview(number, action, body);
      } catch (err) {
        reviewSubmitting.value = false;
        report('PR Review Submit Error', err);
        throw err;
      }
    },
  };
});
