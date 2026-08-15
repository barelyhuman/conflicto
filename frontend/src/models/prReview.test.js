import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';

const getPRReviewState = vi.fn();
const getPRFileViewedStates = vi.fn();
const markPRFileViewed = vi.fn();
const unmarkPRFileViewed = vi.fn();
const submitPRReview = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    getPRReviewState: (...args) => getPRReviewState(...args),
    getPRFileViewedStates: (...args) => getPRFileViewedStates(...args),
    markPRFileViewed: (...args) => markPRFileViewed(...args),
    unmarkPRFileViewed: (...args) => unmarkPRFileViewed(...args),
    submitPRReview: (...args) => submitPRReview(...args),
  },
}));

const { PRReviewModel } = await import('./prReview.js');

describe('PRReviewModel', () => {
  /** @type {InstanceType<typeof PRReviewModel>} */
  let model;
  /** @type {import('@preact/signals-core').Signal<number|null>} */
  let activePR;

  beforeEach(() => {
    getPRReviewState.mockReset();
    getPRFileViewedStates.mockReset();
    markPRFileViewed.mockReset();
    unmarkPRFileViewed.mockReset();
    submitPRReview.mockReset();

    activePR = signal(null);
    model = new PRReviewModel({ activePR });
  });

  afterEach(() => {
    model[Symbol.dispose]?.();
  });

  it('loads review and viewed state when active PR is set', async () => {
    getPRReviewState.mockResolvedValue({
      number: 12,
      pullRequestId: 'PR_12',
      reviewDecision: 'REVIEW_REQUIRED',
      viewerReviewState: '',
      viewerReviewSubmittedAt: '',
    });
    getPRFileViewedStates.mockResolvedValue([
      { path: 'app.go', viewerViewedState: 'UNVIEWED' },
    ]);

    activePR.value = 12;
    await vi.waitFor(() => {
      expect(model.reviewState.value?.number).toBe(12);
      expect(model.viewedStates.value).toHaveLength(1);
    });

    expect(getPRReviewState).toHaveBeenCalledWith(12);
    expect(getPRFileViewedStates).toHaveBeenCalledWith(12);
    expect(model.reviewDecision.value).toBe('REVIEW_REQUIRED');
    expect(model.viewedStateFor('app.go')).toBe('UNVIEWED');
  });

  it('applyReviewState ignores stale PR numbers', () => {
    activePR.value = 5;
    model.applyReviewState({
      number: 9,
      pullRequestId: 'PR_9',
      reviewDecision: 'APPROVED',
      viewerReviewState: 'APPROVED',
      viewerReviewSubmittedAt: '2026-08-14T00:00:00Z',
    });

    expect(model.reviewState.value).toBeNull();
  });

  it('applyFileViewedStates updates lookup helpers', () => {
    activePR.value = 3;
    model.applyFileViewedStates({
      number: 3,
      files: [
        { path: 'a.go', viewerViewedState: 'VIEWED' },
        { path: 'b.go', viewerViewedState: 'DISMISSED' },
      ],
    });

    expect(model.isFileViewed('a.go')).toBe(true);
    expect(model.isFileDismissed('b.go')).toBe(true);
    expect(model.viewedStateFor('missing.go')).toBe('UNVIEWED');
  });

  it('clear resets signals when leaving PR mode', async () => {
    getPRReviewState.mockResolvedValue({
      number: 1,
      pullRequestId: 'PR_1',
      reviewDecision: '',
      viewerReviewState: 'COMMENTED',
      viewerReviewSubmittedAt: '',
    });
    getPRFileViewedStates.mockResolvedValue([]);

    activePR.value = 1;
    await vi.waitFor(() => expect(model.hasViewerReview.value).toBe(true));

    activePR.value = null;
    await vi.waitFor(() => expect(model.reviewState.value).toBeNull());

    expect(model.viewedStates.value).toEqual([]);
    expect(model.reviewLoading.value).toBe(false);
    expect(model.viewedLoading.value).toBe(false);
  });

  it('markViewed calls backend and relies on apply for state', async () => {
    getPRReviewState.mockResolvedValue({
      number: 7,
      pullRequestId: 'PR_7',
      reviewDecision: '',
      viewerReviewState: '',
      viewerReviewSubmittedAt: '',
    });
    getPRFileViewedStates.mockResolvedValue([]);

    activePR.value = 7;
    await vi.waitFor(() => expect(model.viewedLoading.value).toBe(false));

    /** @type {() => void} */
    let resolveMark;
    markPRFileViewed.mockImplementation(
      () => new Promise((resolve) => {
        resolveMark = resolve;
      })
    );

    const pending = model.markViewed('src/main.go');
    expect(model.viewedMutating.value).toBe(true);
    resolveMark();
    await pending;
    expect(markPRFileViewed).toHaveBeenCalledWith(7, 'src/main.go');

    model.applyFileViewedStates({
      number: 7,
      files: [{ path: 'src/main.go', viewerViewedState: 'VIEWED' }],
    });
    expect(model.isFileViewed('src/main.go')).toBe(true);
    expect(model.viewedMutating.value).toBe(false);
  });

  it('submitReview sets submitting until applyReviewState', async () => {
    activePR.value = 4;
    submitPRReview.mockResolvedValue(undefined);

    const pending = model.submitReview('approve', '');
    expect(model.reviewSubmitting.value).toBe(true);
    await pending;

    model.applyReviewState({
      number: 4,
      pullRequestId: 'PR_4',
      reviewDecision: 'APPROVED',
      viewerReviewState: 'APPROVED',
      viewerReviewSubmittedAt: '2026-08-15T00:00:00Z',
    });

    expect(model.isViewerApproved.value).toBe(true);
    expect(model.reviewSubmitting.value).toBe(false);
  });
});
