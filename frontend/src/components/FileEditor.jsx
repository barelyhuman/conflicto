import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { File } from '@pierre/diffs/react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../wails.js';

const fileEditorStyles = `
  .file-editor-wrapper {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
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
 */
export function FileEditor({ path, onError }) {
  const { theme, themeType } = useTheme();
  const [file, setFile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const savedContents = useRef('');
  const editorRef = useRef(null);
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
    editorRef.current = null;
    let cancelled = false;
    setFile(null);
    setLoadError(null);

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
    onAttach: (editor) => {
      editorRef.current = editor;
    },
  }), []);

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
        }}
      />
      <style>{fileEditorStyles}</style>
    </div>
  );
}
