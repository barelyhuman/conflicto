import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { File } from '@pierre/diffs/react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../wails.js';
import { bindEditorClickCaret } from './fileEditorCaret.js';

/** Shadow-DOM CSS: WKWebView often fails `:focus ~ [data-editor-overlay]` caret visibility. */
const EDITOR_UNSAFE_CSS = `
  [data-content] {
    -webkit-user-select: text;
    user-select: text;
  }
  [data-editor-overlay] [data-caret] {
    visibility: visible !important;
  }
`;

const fileEditorStyles = `
  .file-editor-wrapper {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    /* WKWebView: ancestor user-select:none blocks contenteditable carets. */
    -webkit-user-select: text;
    user-select: text;
  }
  .file-editor-loading {
    padding: 16px 18px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .file-editor-error {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 24px;
    text-align: center;
    line-height: 1.45;
  }
`;

/**
 * Simple syntax-highlighted file editor for unstaged worktree files.
 * Saves on Cmd/Ctrl+S.
 *
 * @param {Object} props
 * @param {string} props.path
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {(dirty: boolean) => void} [props.onDirtyChange]
 */
export function FileEditor({ path, onError, onDirtyChange }) {
  const { theme, themeType } = useTheme();
  const [file, setFile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const savedContents = useRef('');
  const editorRef = useRef(null);
  const unbindClickRef = useRef(/** @type {null | (() => void)} */ (null));
  const pathRef = useRef(path);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const reportDirty = useCallback((next) => {
    onDirtyChangeRef.current?.(next !== savedContents.current);
  }, []);

  useEffect(() => {
    pathRef.current = path;
    editorRef.current = null;
    unbindClickRef.current?.();
    unbindClickRef.current = null;
    let cancelled = false;
    setFile(null);
    setLoadError(null);
    onDirtyChangeRef.current?.(false);

    api.getFileContents(path, false).then((res) => {
      if (cancelled) return;
      const contents = res.hasNew
        ? res.newContent
        : res.hasOld
          ? res.oldContent
          : '';
      savedContents.current = contents;
      setFile({
        name: path,
        contents,
        cacheKey: path,
      });
    }).catch((err) => {
      if (!cancelled) {
        setLoadError(err?.message ?? 'Failed to load file');
      }
    });

    return () => {
      cancelled = true;
      unbindClickRef.current?.();
      unbindClickRef.current = null;
      onDirtyChangeRef.current?.(false);
    };
  }, [path]);

  const save = useCallback(async () => {
    const editor = editorRef.current;
    const targetPath = pathRef.current;
    if (!editor || !targetPath) return;

    const next = editor.getText();
    if (next === savedContents.current) return;

    try {
      await api.writeFile(targetPath, next);
      savedContents.current = next;
      onDirtyChangeRef.current?.(false);
    } catch (err) {
      onError?.('Save Error', err?.message ?? String(err));
    }
  }, [onError]);

  useEffect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key !== 's') return;
      e.preventDefault();
      save();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save]);

  const editorOptions = useMemo(() => ({
    persistState: true,
    onChange: (fileContents) => {
      reportDirty(fileContents.contents);
    },
    onAttach: (editor, fileInstance) => {
      editorRef.current = editor;
      unbindClickRef.current?.();
      unbindClickRef.current = bindEditorClickCaret(
        editor,
        fileInstance,
        () => editorRef.current === editor
      );
      // Pierre only applies typed input when #selections is set. WKWebView often
      // never populates that from shadow-DOM selectionchange after a click, so
      // seed a caret via the imperative focus API (see diffs.com/edit).
      queueMicrotask(() => {
        if (editorRef.current !== editor) return;
        editor.focus({ lineNumber: 1, character: 0, preventScroll: true });
        // persistState may restore unsaved text over the disk snapshot.
        reportDirty(editor.getText());
      });
    },
  }), [reportDirty]);

  if (loadError) {
    return (
      <div class="file-editor-error">
        {loadError}
        <style>{fileEditorStyles}</style>
      </div>
    );
  }

  if (!file) {
    return (
      <div class="file-editor-loading" aria-busy="true" aria-label="Loading file">
        Loading file…
        <style>{fileEditorStyles}</style>
      </div>
    );
  }

  return (
    <div class="file-editor-wrapper">
      <File
        key={path}
        file={file}
        edit={true}
        editorOptions={editorOptions}
        options={{
          theme,
          themeType: themeType === 'light' ? 'light' : 'dark',
          disableFileHeader: true,
          overflow: 'wrap',
          unsafeCSS: EDITOR_UNSAFE_CSS,
        }}
      />
      <style>{fileEditorStyles}</style>
    </div>
  );
}
