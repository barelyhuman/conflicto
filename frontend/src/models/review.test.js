import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewModel } from './review.js';

const patch = ['@@ -1,2 +1,3 @@', ' a', '+b', ' c'].join('\n');

function makeApi() {
  let n = 0;

  return {
    getReviewState: vi.fn().mockResolvedValue({
      drafts: [],
      headSHA: 'sha1',
      files: [{ path: 'src/a.js', patch }],
    }),
    saveReviewDraft: vi.fn(async (_n, d) => ({ ...d, id: d.id || `id${++n}`, createdAt: 'now' })),
    deleteReviewDraft: vi.fn().mockResolvedValue(undefined),
    submitReview: vi.fn().mockResolvedValue(undefined),
    postPRComment: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ReviewModel', () => {
  let api;
  let onError;
  let readClipboard;
  let model;

  beforeEach(async () => {
    api = makeApi();
    onError = vi.fn();
    readClipboard = vi.fn();
    model = new ReviewModel({ api, onError, readClipboard });
    await model.load(5);
  });

  afterEach(() => model[Symbol.dispose]?.());

  it('loads state for a PR and clears on null', async () => {
    expect(model.headSHA.value).toBe('sha1');
    expect(model.files.value).toHaveLength(1);
    await model.load(null);
    expect(model.files.value).toEqual([]);
  });

  it('opens composer from selection with GitHub coordinates', () => {
    expect(model.openFromSelection()).toBe(false);
    expect(onError).toHaveBeenCalled();
    model.setSelection('src/a.js', { start: 3, end: 2, side: 'additions', endSide: 'additions' });
    expect(model.openFromSelection()).toBe(true);
    expect(model.composer.value.loc).toEqual({ line: 3, side: 'RIGHT', startLine: 2, startSide: 'RIGHT' });
  });

  it('adds to review, then edits the same draft', async () => {
    model.openComposer('src/a.js', { line: 2, side: 'RIGHT' });
    expect(await model.addToReview('  nit  ')).toBe(true);
    expect(model.pendingCount.value).toBe(1);
    expect(model.composer.value).toBeNull();
    expect(api.saveReviewDraft.mock.calls[0][1]).toMatchObject({
      body: 'nit', startLine: 0, headSHA: 'sha1', path: 'src/a.js',
    });

    const id = model.drafts.value[0].id;

    model.editDraft(id);
    expect(model.composer.value.editId).toBe(id);
    await model.addToReview('better');
    expect(model.drafts.value).toHaveLength(1);
    expect(model.drafts.value[0].body).toBe('better');
  });

  it('ignores empty bodies', async () => {
    model.openComposer('src/a.js', { line: 1, side: 'RIGHT' });
    expect(await model.addToReview('   ')).toBe(false);
    expect(api.saveReviewDraft).not.toHaveBeenCalled();
  });

  it('comment now posts a single comment with start fields', async () => {
    model.openComposer('src/a.js', { line: 3, side: 'RIGHT', startLine: 1, startSide: 'RIGHT' });
    await model.commentNow('hi');
    expect(api.postPRComment).toHaveBeenCalledWith(5, 'src/a.js', 'hi', 3, 'RIGHT', 1, 'RIGHT');
    expect(model.composer.value).toBeNull();
  });

  it('deletes drafts', async () => {
    model.openComposer('src/a.js', { line: 1, side: 'RIGHT' });
    await model.addToReview('x');
    await model.deleteDraft(model.drafts.value[0].id);
    expect(model.drafts.value).toEqual([]);
  });

  it('submit posts once and clears drafts; failures keep them', async () => {
    model.openComposer('src/a.js', { line: 1, side: 'RIGHT' });
    await model.addToReview('x');
    api.submitReview.mockRejectedValueOnce(new Error('422'));
    expect(await model.submit('COMMENT', 'sum')).toBe(false);
    expect(model.pendingCount.value).toBe(1);
    expect(onError).toHaveBeenCalledWith('Submit Review Error', '422');
    expect(await model.submit('APPROVE', '')).toBe(true);
    expect(api.submitReview).toHaveBeenLastCalledWith(5, 'APPROVE', '');
    expect(model.pendingCount.value).toBe(0);
  });

  it('flags outdated drafts after head changes', async () => {
    api.getReviewState.mockResolvedValue({
      drafts: [
        { id: 'a', path: 'src/a.js', body: 'x', line: 2, side: 'RIGHT', headSHA: 'old' },
        { id: 'b', path: 'src/a.js', body: 'x', line: 99, side: 'RIGHT', headSHA: 'old' },
        { id: 'c', path: 'src/a.js', body: 'x', line: 99, side: 'RIGHT', headSHA: 'sha1' },
      ],
      headSHA: 'sha1',
      files: [{ path: 'src/a.js', patch }],
    });
    await model.load(5);
    expect([...model.outdatedIds.value]).toEqual(['b']);
    expect(model.outdatedCount.value).toBe(1);
  });

  describe('clipboard', () => {
    it('uses selection and offers path:line suggestion', async () => {
      model.setSelection('src/a.js', { start: 1, end: 1, side: 'additions' });
      readClipboard.mockResolvedValue('src/a.js:2 off by one');
      expect(await model.openFromClipboard()).toBe(true);

      const c = model.composer.value;

      expect(c.loc).toEqual({ line: 1, side: 'RIGHT' });
      expect(c.initialBody).toBe('src/a.js:2 off by one');
      expect(c.suggestion.label).toBe('src/a.js:2');

      model.acceptSuggestion();
      expect(model.composer.value.loc).toEqual({ line: 2, side: 'RIGHT' });
      expect(model.composer.value.initialBody).toBe('off by one');
      expect(model.composer.value.suggestion).toBeNull();
    });

    it('opens at the referenced location without a selection', async () => {
      readClipboard.mockResolvedValue('src/a.js:3: boom');
      expect(await model.openFromClipboard()).toBe(true);
      expect(model.composer.value.path).toBe('src/a.js');
      expect(model.composer.value.initialBody).toBe('boom');
    });

    it('errors when there is nowhere to attach', async () => {
      readClipboard.mockResolvedValue('plain text');
      expect(await model.openFromClipboard()).toBe(false);
      expect(onError).toHaveBeenCalled();
      readClipboard.mockResolvedValue('  ');
      expect(await model.openFromClipboard()).toBe(false);
    });
  });
});
