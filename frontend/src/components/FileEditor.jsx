import { useModel } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { File } from '@pierre/diffs/react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FileEditorModel } from '../models/fileEditor.js';

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
 * @param {import('@preact/signals-core').Signal<string|null>} props.path
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {import('@preact/signals-core').Signal<boolean>} props.editorDirty
 * @param {import('@preact/signals-core').Signal<number|null>} [props.editorGotoLine]
 */
export function FileEditor({ path, onError, editorDirty, editorGotoLine }) {
  const model = useModel(() => new FileEditorModel({ path, editorDirty, editorGotoLine, onError }));
  const { theme, themeType } = useTheme();

  return (
    <>
      <Show when={model.loadError}>
        {(message) => (
          <div class="file-editor-error">
            {message}
            <style>{fileEditorStyles}</style>
          </div>
        )}
      </Show>
      <Show when={() => !model.loadError.value}>
        <Show
          when={model.file}
          fallback={
            <div class="file-editor-loading" aria-busy="true" aria-label="Loading file">
              Loading file…
              <style>{fileEditorStyles}</style>
            </div>
          }
        >
          {(file) => (
            <div class="file-editor-wrapper">
              <File
                key={file.cacheKey}
                file={file}
                edit={true}
                editorOptions={model.editorOptions}
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
          )}
        </Show>
      </Show>
    </>
  );
}
