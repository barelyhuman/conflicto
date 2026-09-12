import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { Show } from '@preact/signals/utils';
import { UnresolvedFile } from '@pierre/diffs/react';
import { api } from '../wails.js';
import { conflictViewFromContents } from './conflictView.js';
import { useTheme } from '../theme/ThemeProvider.jsx';

const conflictStyles = `
  .conflict-viewer-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    --diffs-addition-color: var(--text);
    --diffs-deletion-color: var(--grey);
    --diffs-modified-color: var(--grey);
  }
  .diff-loading {
    padding: 16px 18px;
  }
  .diff-skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 720px;
  }
  .diff-skeleton-line {
    height: 10px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      rgba(127, 127, 127, 0.1) 0%,
      rgba(127, 127, 127, 0.18) 50%,
      rgba(127, 127, 127, 0.1) 100%
    );
    background-size: 200% 100%;
    animation: diff-skeleton-shimmer 1.2s ease-in-out infinite;
    width: 72%;
  }
  .diff-skeleton-line.wide { width: 92%; }
  .diff-skeleton-line.mid { width: 58%; }
  .diff-skeleton-line.short { width: 40%; }
  @keyframes diff-skeleton-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }
  .diff-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
  }
`;

/**
 * Renders a file with merge conflict markers. UnresolvedFile takes the raw
 * worktree contents and derives ours/theirs regions itself, so the fetch
 * goes through GetFileContents rather than the combined-diff patch that
 * `git diff` produces for unmerged paths.
 *
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<string|null>} props.file
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.loading]
 */
export function ConflictViewer({ file, loading = false }) {
  const { theme, themeType } = useTheme();
  const requestId = useRef(0);
  const status = useSignal({ loading: false, view: null });

  const busy = useComputed(() => {
    const propLoading = Boolean(loading.value);
    const s = status.value;
    return propLoading || s.loading;
  });
  const view = useComputed(() => {
    const s = status.value;
    return s.loading ? null : s.view;
  });

  useSignalEffect(() => {
    const path = file.value;
    if (!path) {
      status.value = { loading: false, view: null };
      return;
    }
    status.value = { loading: true, view: null };
    const request = ++requestId.current;
    api.getFileContents(path, false).then(
      (res) => {
        if (requestId.current !== request) return;
        status.value = conflictViewFromContents(path, res);
      },
      () => {
        if (requestId.current !== request) return;
        status.value = { loading: false, view: null };
      }
    );
  });

  return (
    <div class="conflict-viewer-wrapper">
      <Show
        when={busy}
        fallback={
          <Show
            when={view}
            fallback={<div class="diff-empty">No conflict data available</div>}
          >
            {(data) => (
              <UnresolvedFile
                key={data.path}
                file={{ name: data.path, contents: data.contents }}
                options={{
                  theme,
                  themeType: themeType === 'light' ? 'light' : 'dark',
                  overflow: 'wrap',
                  disableFileHeader: true,
                }}
              />
            )}
          </Show>
        }
      >
        <div
          class="diff-loading"
          aria-busy="true"
          aria-label="Loading conflict"
        >
          <div class="diff-skeleton">
            <div class="diff-skeleton-line wide" />
            <div class="diff-skeleton-line" />
            <div class="diff-skeleton-line mid" />
            <div class="diff-skeleton-line" />
            <div class="diff-skeleton-line short" />
            <div class="diff-skeleton-line mid" />
          </div>
        </div>
      </Show>
      <style>{conflictStyles}</style>
    </div>
  );
}
