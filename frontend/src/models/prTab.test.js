import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRTabModel, createPRTabRegistry } from './prTab.js';
import { TabsModel } from './tabs.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeApi(overrides = {}) {
  return {
    getPRDetails: vi.fn(async (n) => ({ number: n, title: 'Fix', checks: { status: 'running' }, worktreePath: '' })),
    getPRFilesList: vi.fn(async () => [{ path: 'a.go' }, { path: 'b.go' }, { path: 'c.go' }]),
    getPRFilePatch: vi.fn(async (n, path) => ({ patch: `patch:${path}` })),
    getPRReviewComments: vi.fn(async () => [{ path: 'a.go', line: 1, body: 'hi' }]),
    getPRTimeline: vi.fn(async () => [{ kind: 'comment', author: 'x', body: 'yo' }]),
    getReviewState: vi.fn(async () => ({ drafts: [], headSHA: 'abc', files: [] })),
    postPRComment: vi.fn(async () => {}),
    submitReview: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('PRTabModel', () => {
  let api;
  let model;

  beforeEach(() => {
    api = fakeApi();
    model = new PRTabModel({ number: 7, api });
  });

  afterEach(() => {
    model.markDisposed();
    model.review[Symbol.dispose]?.();
    model[Symbol.dispose]?.();
    vi.useRealTimers();
  });

  it('loads details, files, comments, timeline and selects the first file', async () => {
    await model.load();
    expect(model.details.value.title).toBe('Fix');
    expect(model.files.value).toHaveLength(3);
    expect(model.comments.value).toHaveLength(1);
    expect(model.timeline.value).toHaveLength(1);
    expect(model.selectedPath.value).toBe('a.go');
    await flush();
    expect(model.activeDiff.value).toEqual({ patch: 'patch:a.go', path: 'a.go' });
    expect(model.loading.value).toBe(false);
    expect(model.review.headSHA.value).toBe('abc');
  });

  it('load is idempotent', async () => {
    await model.load();
    await model.load();
    expect(api.getPRDetails).toHaveBeenCalledTimes(1);
  });

  it('caches patches per path', async () => {
    await model.load();
    await flush();
    model.selectFile('b.go');
    expect(model.diffLoading.value).toBe(true);
    await flush();
    expect(model.diffLoading.value).toBe(false);
    model.selectFile('a.go');
    await flush();
    expect(api.getPRFilePatch).toHaveBeenCalledTimes(2);
    expect(model.activeDiff.value.patch).toBe('patch:a.go');
  });

  it('steps through files and wraps', async () => {
    await model.load();
    model.stepFile(-1);
    expect(model.selectedPath.value).toBe('c.go');
    model.stepFile(1);
    expect(model.selectedPath.value).toBe('a.go');
    model.stepFile(1);
    expect(model.selectedPath.value).toBe('b.go');
  });

  it('shows an error state when details reject, without breaking the rest', async () => {
    api.getPRDetails.mockRejectedValue(new Error('no gh'));
    await model.load();
    expect(model.error.value).toBe('no gh');
    expect(model.loading.value).toBe(false);
    expect(model.files.value).toHaveLength(3);
  });

  it('records files, timeline and patch errors', async () => {
    api.getPRFilesList.mockRejectedValue(new Error('files down'));
    api.getPRTimeline.mockRejectedValue(new Error('tl down'));
    await model.load();
    expect(model.filesError.value).toBe('files down');
    expect(model.timelineError.value).toBe('tl down');
    expect(model.filesLoading.value).toBe(false);

    api.getPRFilePatch.mockRejectedValue(new Error('patch down'));
    model.selectFile('z.go');
    await flush();
    expect(model.patchError.value).toBe('patch down');
    expect(model.diffLoading.value).toBe(false);
  });

  it('refresh drops cached patches and refetches the selection', async () => {
    await model.load();
    await flush();
    api.getPRFilePatch.mockImplementation(async () => ({ patch: 'new' }));
    await model.refresh();
    expect(model.activeDiff.value.patch).toBe('new');
  });

  it('loads review state only after the file list returns', async () => {
    let releaseFiles;
    api.getPRFilesList.mockImplementation(() => new Promise((resolve) => {
      releaseFiles = resolve;
    }));
    const pending = model.load();

    await flush();
    expect(api.getReviewState).not.toHaveBeenCalled();
    releaseFiles([{ path: 'a.go' }]);
    await pending;
    expect(api.getReviewState).toHaveBeenCalledWith(7);
  });

  it('keeps old details when a silent refresh fails', async () => {
    await model.load();
    api.getPRDetails.mockRejectedValue(new Error('flaky'));
    await model.refreshDetails();
    expect(model.details.value.title).toBe('Fix');
    expect(model.error.value).toBeNull();
  });

  it('applies checks and worktree path to details', async () => {
    await model.load();
    model.applyChecks({ status: 'success' });
    expect(model.checks.value.status).toBe('success');
    model.setWorktreePath('/wt/pr7');
    expect(model.details.value.worktreePath).toBe('/wt/pr7');
  });

  it('refreshes comments and timeline after the review posts', async () => {
    await model.load();
    api.getPRReviewComments.mockClear();
    api.getPRTimeline.mockClear();
    await model.review.load(7);
    model.review.openComposer('a.go', { line: 1, side: 'RIGHT' });
    await model.review.commentNow('hello');
    expect(api.getPRReviewComments).toHaveBeenCalledTimes(1);
    model.review.openComposer('a.go', { line: 1, side: 'RIGHT' });
    await model.review.submit('COMMENT', 'ok');
    expect(api.getPRTimeline).toHaveBeenCalledTimes(1);
  });
});

describe('createPRTabRegistry', () => {
  it('keeps one model per scope + number and starts loading once', async () => {
    const api = fakeApi();
    const reg = createPRTabRegistry({ api });
    const a = reg.get('/a', 1);
    expect(reg.get('/a', 1)).toBe(a);
    expect(reg.get('/b', 1)).not.toBe(a);
    await flush();
    expect(api.getPRDetails).toHaveBeenCalledTimes(2);
  });

  it('rekey moves the model without refetching', async () => {
    const api = fakeApi();
    const reg = createPRTabRegistry({ api });
    const m = reg.get('/origin', 4);
    await flush();
    expect(reg.rekey(4, '/origin', '/wt')).toBe(m);
    expect(reg.peek('/origin', 4)).toBeNull();
    expect(reg.get('/wt', 4)).toBe(m);
    expect(api.getPRDetails).toHaveBeenCalledTimes(1);
  });

  it('disposes the model when its tab is discarded, not when it moves', async () => {
    const api = fakeApi();
    const reg = createPRTabRegistry({ api });
    const tabs = new TabsModel();
    tabs.setScope('/origin');
    reg.bindTabs(tabs);
    tabs.open({ kind: 'pr', number: 5 });
    const m = reg.get('/origin', 5);
    await flush();
    tabs.moveTab('pr:5', '/origin', '/wt');
    reg.rekey(5, '/origin', '/wt');
    expect(reg.peek('/wt', 5)).toBe(m);
    tabs.setScope('/wt');
    tabs.close('pr:5');
    expect(reg.peek('/wt', 5)).toBeNull();
    // late responses after disposal are ignored
    await m.refreshDetails();
  });

  it('releases models for a removed scope', async () => {
    const reg = createPRTabRegistry({ api: fakeApi() });
    const tabs = new TabsModel();
    tabs.setScope('/gone');
    reg.bindTabs(tabs);
    tabs.open({ kind: 'pr', number: 2 });
    reg.get('/gone', 2);
    tabs.removeScope('/gone');
    expect(reg.peek('/gone', 2)).toBeNull();
  });
});
