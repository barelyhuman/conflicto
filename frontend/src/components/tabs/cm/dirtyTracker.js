/**
 * Tracks whether the editor document differs from the last saved one.
 *
 * @param {import('@codemirror/state').Text} initialDoc
 * @param {(dirty: boolean) => void} onChange
 */
export function createDirtyTracker(initialDoc, onChange) {
  let saved = initialDoc;
  let reported = false;

  function set(dirty) {
    if (dirty === reported) return;
    reported = dirty;
    onChange(dirty);
  }

  return {
    isDirty: () => reported,
    /** The document changed. */
    update(doc) {
      set(!doc.eq(saved));
    },
    /**
     * `written` is the document that was sent to disk; `current` is the document now.
     * Edits made while the write was in flight stay dirty.
     */
    markSaved(written, current) {
      saved = written;
      set(!current.eq(saved));
    },
    /** The document was replaced from disk; it is clean by definition. */
    reset(doc) {
      saved = doc;
    },
  };
}
