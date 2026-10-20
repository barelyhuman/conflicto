import { createModel, signal, computed } from '@preact/signals';
import { api as defaultApi } from '../wails.js';
import {
  isDraftOutdated,
  parseClipboardRef,
  rangeToLocation,
  refToLocation,
} from '../components/reviewLines.js';

/**
 * @typedef {{ line: number, side: 'LEFT'|'RIGHT', startLine?: number, startSide?: 'LEFT'|'RIGHT' }} Loc
 * @typedef {{
 *   id: string, path: string, body: string, line: number, side: string,
 *   startLine?: number, startSide?: string, headSHA?: string, createdAt?: string,
 * }} Draft
 * @typedef {{
 *   editId: string|null, path: string, loc: Loc, initialBody: string, rev: number,
 *   suggestion: { path: string, loc: Loc, label: string, rest: string }|null,
 * }} Composer
 */

/**
 * GitHub-style pending review for the active PR: selection, inline composer,
 * persisted drafts (backend), and one-shot submit.
 *
 * @param {{
 *   api?: typeof defaultApi,
 *   onError?: (title: string, message: string) => void,
 *   readClipboard?: () => Promise<string>,
 * }} [opts]
 */
export const ReviewModel = createModel(({ api = defaultApi, onError, readClipboard } = {}) => {
  const prNumber = signal(/** @type {number|null} */ (null));
  const drafts = signal(/** @type {Draft[]} */ ([]));
  const headSHA = signal('');
  const files = signal(/** @type {{ path: string, patch: string }[]} */ ([]));
  const submitting = signal(false);
  /** Current line selection in the visible diff. */
  const selection = signal(/** @type {{ path: string, range: object }|null} */ (null));
  const composer = signal(/** @type {Composer|null} */ (null));

  const pendingCount = computed(() => drafts.value.length);

  const outdatedIds = computed(() => {
    const byPath = new Map(files.value.map((f) => [f.path, f.patch]));
    const ids = new Set();

    for (const d of drafts.value) {
      const patch = byPath.has(d.path) ? byPath.get(d.path) : null;

      if (isDraftOutdated(d, { currentHeadSHA: headSHA.value, patch })) ids.add(d.id);
    }

    return ids;
  });

  const outdatedCount = computed(() => outdatedIds.value.size);

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  function patchFor(path) {
    return files.peek().find((f) => f.path === path)?.patch ?? null;
  }

  let rev = 0;

  return {
    prNumber,
    drafts,
    headSHA,
    files,
    submitting,
    selection,
    composer,
    pendingCount,
    outdatedIds,
    outdatedCount,

    /** Load persisted drafts + head SHA/patches for a PR (null clears). */
    async load(number) {
      if (prNumber.peek() !== number) {
        selection.value = null;
        composer.value = null;
      }
      prNumber.value = number;

      if (number == null) {
        drafts.value = [];
        headSHA.value = '';
        files.value = [];

        return;
      }

      try {
        const state = await api.getReviewState(number);

        if (prNumber.peek() !== number) return;
        drafts.value = state?.drafts ?? [];
        headSHA.value = state?.headSHA ?? '';
        files.value = state?.files ?? [];
      } catch (err) {
        report('Review Error', err);
      }
    },

    setSelection(path, range) {
      selection.value = range && path ? { path, range } : null;
    },

    /** @param {string} path @param {Loc} loc */
    openComposer(path, loc, initialBody = '', suggestion = null) {
      composer.value = { editId: null, path, loc, initialBody, rev: ++rev, suggestion };
    },

    /** Open the composer under the current selection. Returns false if none. */
    openFromSelection() {
      const sel = selection.peek();
      const loc = sel ? rangeToLocation(sel.range) : null;

      if (!sel || !loc) {
        report('Add comment', new Error('Select a line or range in the diff first.'));

        return false;
      }
      this.openComposer(sel.path, loc);

      return true;
    },

    /** Open the composer for a gutter "+" click. */
    openFromRange(path, range) {
      const loc = rangeToLocation(range);

      if (!loc) return false;
      this.openComposer(path, loc);

      return true;
    },

    /** Pre-fill the composer from the clipboard, honoring a leading path:line ref. */
    async openFromClipboard() {
      let text;

      try {
        text = ((await (readClipboard ?? api.clipboardGetText)()) ?? '').trim();
      } catch (err) {
        report('Clipboard', err);

        return false;
      }

      if (!text) {
        report('Clipboard', new Error('Clipboard is empty.'));

        return false;
      }

      const ref = parseClipboardRef(text, files.peek().map((f) => f.path));
      const refLoc = ref ? refToLocation(ref, patchFor(ref.path)) : null;
      const sel = selection.peek();
      const selLoc = sel ? rangeToLocation(sel.range) : null;

      if (sel && selLoc) {
        const suggestion = ref
          ? {
              path: ref.path,
              loc: refLoc,
              rest: ref.rest,
              label: `${ref.path}:${ref.startLine}${ref.endLine !== ref.startLine ? `-${ref.endLine}` : ''}`,
            }
          : null;

        this.openComposer(sel.path, selLoc, text, suggestion);

        return true;
      }

      if (ref && refLoc) {
        this.openComposer(ref.path, refLoc, ref.rest || text);

        return true;
      }

      report('Add comment from clipboard', new Error('Select lines first, or start the text with path:line.'));

      return false;
    },

    /** Move the open composer to the clipboard-suggested location. */
    acceptSuggestion() {
      const c = composer.peek();

      if (!c?.suggestion) return;
      composer.value = {
        ...c,
        path: c.suggestion.path,
        loc: c.suggestion.loc,
        initialBody: c.suggestion.rest || c.initialBody,
        suggestion: null,
        rev: ++rev,
      };
    },

    editDraft(id) {
      const d = drafts.peek().find((x) => x.id === id);

      if (!d) return;
      composer.value = {
        editId: id,
        path: d.path,
        loc: {
          line: d.line,
          side: d.side,
          ...(d.startLine ? { startLine: d.startLine, startSide: d.startSide } : {}),
        },
        initialBody: d.body,
        rev: ++rev,
        suggestion: null,
      };
    },

    closeComposer() {
      composer.value = null;
    },

    /** Save the composer as a pending draft (create or update). */
    async addToReview(body) {
      const c = composer.peek();
      const number = prNumber.peek();
      const text = (body ?? '').trim();

      if (!c || number == null || !text) return false;
      const existing = c.editId ? drafts.peek().find((d) => d.id === c.editId) : null;

      try {
        const saved = await api.saveReviewDraft(number, {
          id: c.editId ?? '',
          path: c.path,
          body: text,
          line: c.loc.line,
          side: c.loc.side,
          startLine: c.loc.startLine ?? 0,
          startSide: c.loc.startSide ?? '',
          headSHA: existing ? existing.headSHA ?? '' : headSHA.peek(),
          createdAt: existing?.createdAt ?? '',
        });
        const list = drafts.peek();

        drafts.value = list.some((d) => d.id === saved.id)
          ? list.map((d) => (d.id === saved.id ? saved : d))
          : [...list, saved];
        composer.value = null;

        return true;
      } catch (err) {
        report('Review Error', err);

        return false;
      }
    },

    /** Post the composer as a single standalone comment (existing behaviour). */
    async commentNow(body) {
      const c = composer.peek();
      const number = prNumber.peek();
      const text = (body ?? '').trim();

      if (!c || number == null || !text) return false;

      try {
        await api.postPRComment(
          number, c.path, text, c.loc.line, c.loc.side, c.loc.startLine ?? 0, c.loc.startSide ?? ''
        );
        composer.value = null;

        return true;
      } catch (err) {
        report('Comment Error', err);

        return false;
      }
    },

    async deleteDraft(id) {
      const number = prNumber.peek();

      if (number == null) return;

      try {
        await api.deleteReviewDraft(number, id);
        drafts.value = drafts.peek().filter((d) => d.id !== id);

        if (composer.peek()?.editId === id) composer.value = null;
      } catch (err) {
        report('Review Error', err);
      }
    },

    /** Submit every pending draft in one review. @param {'COMMENT'|'APPROVE'|'REQUEST_CHANGES'} event */
    async submit(event, body) {
      const number = prNumber.peek();

      if (number == null || submitting.peek()) return false;
      submitting.value = true;

      try {
        await api.submitReview(number, event, body ?? '');
        drafts.value = [];
        composer.value = null;

        return true;
      } catch (err) {
        report('Submit Review Error', err);

        return false;
      } finally {
        submitting.value = false;
      }
    },
  };
});
