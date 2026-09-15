import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { useMemo, useRef } from 'preact/hooks';
import { Show } from '@preact/signals/utils';
import { parseDiffFromFile } from '@pierre/diffs';
import { File, FileDiff, UnresolvedFile } from '@pierre/diffs/react';
import { api } from '../wails.js';
import { conflictViewFromStages } from './conflictView.js';
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
 * Ours vs theirs comparison for conflicts without inline markers
 * (modify/delete). Missing sides render as pure additions/deletions.
 *
 * @param {Object} props
 * @param {string} props.path
 * @param {string|null} props.ours
 * @param {string|null} props.theirs
 * @param {import('@pierre/diffs').ThemeTypes} props.theme
 * @param {'light'|'dark'} props.themeType
 */
function ConflictSideDiff({ path, ours, theirs, theme, themeType }) {
  const oursFile = useMemo(
    () => (ours != null ? { name: `${path} (ours)`, contents: ours } : null),
    [path, ours]
  );
  const theirsFile = useMemo(
    () =>
      theirs != null ? { name: `${path} (theirs)`, contents: theirs } : null,
    [path, theirs]
  );
  const fileDiff = useMemo(
    () => parseDiffFromFile(oursFile, theirsFile),
    [oursFile, theirsFile]
  );

  return (
    <FileDiff
      key={path}
      fileDiff={fileDiff}
      options={{
        theme,
        themeType,
        overflow: 'wrap',
        loadDiffFiles: () => ({ oldFile: oursFile, newFile: theirsFile }),
      }}
    />
  );
}

/**
 * Renders a file with merge conflicts. Marker conflicts (both modified or
 * both added) render through UnresolvedFile from the worktree contents;
 * marker-free conflicts (modify/delete) compare the ours/theirs index
 * stages instead; marker-free content without stages falls back to a plain
 * file view, since UnresolvedFile draws nothing without hunks. The fetch
 * goes through GetConflictFile rather than the combined-diff patch that
 * `git diff` produces for unmerged paths.
 *
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<string|null>} props.file
 */
export function ConflictViewer({ file }) {
  const { theme, themeType } = useTheme();
  const requestId = useRef(0);
  const status = useSignal({ loading: false, view: null });

  const busy = useComputed(() => status.value.loading);
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
    api.getConflictFile(path).then(
      (res) => {
        if (requestId.current !== request) return;
        status.value = conflictViewFromStages(path, res);
      },
      () => {
        if (requestId.current !== request) return;
        status.value = { loading: false, view: null };
      }
    );
  });

  const themeTypeOption = themeType === 'light' ? 'light' : 'dark';

  return (
    <div class="conflict-viewer-wrapper">
      <Show
        when={busy}
        fallback={
          <Show
            when={view}
            fallback={<div class="diff-empty">No conflict data available</div>}
          >
            {(data) => {
              if (data.kind === 'deleted') {
                return <div class="diff-empty">Both sides deleted this file</div>;
              }
              if (data.kind === 'sides') {
                return (
                  <ConflictSideDiff
                    key={data.path}
                    path={data.path}
                    ours={data.ours}
                    theirs={data.theirs}
                    theme={theme}
                    themeType={themeTypeOption}
                  />
                );
              }
              if (data.kind === 'plain') {
                // Marker-free with no stages (e.g. the conflict was just
                // resolved): UnresolvedFile draws nothing without hunks, so
                // show the current contents as a plain file instead.
                return (
                  <File
                    key={data.path}
                    file={{ name: data.path, contents: data.contents }}
                    options={{
                      theme,
                      themeType: themeTypeOption,
                      overflow: 'wrap',
                      disableFileHeader: true,
                    }}
                  />
                );
              }
              return (
                <UnresolvedFile
                  key={data.path}
                  file={{ name: data.path, contents: data.contents }}
                  options={{
                    theme,
                    themeType: themeTypeOption,
                    overflow: 'wrap',
                    disableFileHeader: true,
                  }}
                />
              );
            }}
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
