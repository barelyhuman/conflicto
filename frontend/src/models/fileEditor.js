import { createModel, signal, effect } from '@preact/signals';
import { api } from '../wails.js';
import { bindEditorClickCaret } from '../components/fileEditorCaret.js';

/**
 * Count 1-based lines in a text buffer (empty → 1 editable line).
 * @param {string} text
 * @returns {number}
 */
function lineCountOf(text) {
  if (text.length === 0) return 1;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  // Trailing newline yields an extra empty line in split semantics; Pierre's
  // document still treats the final break as ending the last line, so drop it.
  if (text.charCodeAt(text.length - 1) === 10) count--;
  return Math.max(1, count);
}

/**
 * Clamp a requested 1-based line into the editor buffer.
 * @param {import('@pierre/diffs/edit').Editor} editor
 * @param {number} requested
 * @returns {number}
 */
function clampEditorLine(editor, requested) {
  const lineCount = lineCountOf(editor.getText());
  return Math.max(1, Math.min(Math.floor(requested), lineCount));
}

/**
 * Load/save/dirty state for the unstaged mini editor (Pierre File in edit mode).
 *
 * @param {{
 *   path: import('@preact/signals-core').Signal<string|null>,
 *   editorDirty: import('@preact/signals-core').Signal<boolean>,
 *   editorGotoLine?: import('@preact/signals-core').Signal<number|null>,
 *   onError?: (title: string, message: string) => void,
 * }} opts
 */
export const FileEditorModel = createModel(({ path, editorDirty, editorGotoLine, onError }) => {
  /** @type {import('@preact/signals-core').Signal<null | { name: string, contents: string, cacheKey: string }>} */
  const file = signal(null);
  const loadError = signal(/** @type {string|null} */ (null));

  let savedContents = '';
  /** @type {import('@pierre/diffs/edit').Editor | null} */
  let editorRef = null;
  let unbindClickRef = /** @type {null | (() => void)} */ (null);

  function resetEditorHandles() {
    editorRef = null;
    unbindClickRef?.();
    unbindClickRef = null;
  }

  function reportDirty(next) {
    editorDirty.value = next !== savedContents;
  }

  function attachEditor(editor, fileInstance) {
    editorRef = editor;
    unbindClickRef?.();
    unbindClickRef = bindEditorClickCaret(editor, fileInstance, () => editorRef === editor);
    queueMicrotask(() => {
      if (editorRef !== editor) return;
      const requested = editorGotoLine?.peek() ?? 1;
      const target = clampEditorLine(editor, requested);
      editor.focus({ lineNumber: target, character: 0, preventScroll: false });
      if (editorGotoLine != null) {
        editorGotoLine.value = null;
      }
      reportDirty(editor.getText());
    });
  }

  const editorOptions = {
    persistState: true,
    onChange: (fileContents) => {
      reportDirty(fileContents.contents);
    },
    onAttach: (editor, fileInstance) => {
      attachEditor(editor, fileInstance);
    },
  };

  effect(() => {
    const targetPath = path.value;
    resetEditorHandles();
    file.value = null;
    loadError.value = null;
    editorDirty.value = false;

    if (!targetPath) {
      return;
    }

    let cancelled = false;

    api.getFileContents(targetPath, false).then((res) => {
      if (cancelled) return;
      const contents = res.hasNew
        ? res.newContent
        : res.hasOld
          ? res.oldContent
          : '';
      savedContents = contents;
      file.value = {
        name: targetPath,
        contents,
        cacheKey: targetPath,
      };
    }).catch((err) => {
      if (!cancelled) {
        loadError.value = err?.message ?? 'Failed to load file';
      }
    });

    return () => {
      cancelled = true;
      resetEditorHandles();
      editorDirty.value = false;
    };
  });

  async function save() {
    const editor = editorRef;
    const targetPath = path.peek();
    if (!editor || !targetPath) return;

    const next = editor.getText();
    if (next === savedContents) return;

    try {
      await api.writeFile(targetPath, next);
      savedContents = next;
      editorDirty.value = false;
    } catch (err) {
      onError?.('Save Error', err?.message ?? String(err));
    }
  }

  effect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key !== 's') return;
      e.preventDefault();
      save();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return {
    path,
    file,
    loadError,
    editorOptions,
    save,
  };
});
