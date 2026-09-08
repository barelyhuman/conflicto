import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { File } from '@pierre/diffs/react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../wails.js';

const SAVE_DEBOUNCE_MS = 400;

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
 *
 * @param {Object} props
 * @param {string} props.path
 * @param {(title: string, message: string) => void} [props.onError]
 */
export function FileEditor({ path, onError }) {
  const { theme, themeType } = useTheme();
  const [file, setFile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const lastSaved = useRef('');
  const saveTimer = useRef(null);
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
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
      lastSaved.current = contents;
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

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
  }, []);

  const saveContents = useCallback(async (next) => {
    const targetPath = pathRef.current;
    if (!targetPath || next === lastSaved.current) return;
    try {
      await api.writeFile(targetPath, next);
      lastSaved.current = next;
    } catch (err) {
      onError?.('Save Error', err?.message ?? String(err));
    }
  }, [onError]);

  const editorOptions = useMemo(() => ({
    persistState: true,
    onChange: (fileContents) => {
      const next = fileContents.contents;
      if (next === lastSaved.current) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        saveContents(next);
      }, SAVE_DEBOUNCE_MS);
    },
  }), [saveContents]);

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
