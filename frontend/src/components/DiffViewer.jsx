import { useMemo, useRef, useState, useLayoutEffect } from 'preact/hooks';
import { FileDiff } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { api } from '../wails.js';

const diffViewerStyles = `
  .diff-viewer-wrapper {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
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
    padding: 24px;
    text-align: center;
    max-width: 420px;
    margin: 0 auto;
    line-height: 1.45;
  }
  .diff-comment {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    background: var(--surface-raised);
    border-left: 2px solid var(--accent-hover);
  }
  .diff-comment-author {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-h);
  }
  .diff-comment-body {
    font-size: 12px;
    color: var(--text);
    white-space: pre-wrap;
  }
`;

/**
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<{ path?: string, patch?: string }|null>} props.activeDiff
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.loading]
 * @param {boolean} props.isPRMode
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.isUnstaged
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.showFullDiff]
 * @param {{ path: string, line: number, body: string, user: { login: string } }[]} props.comments
 * @param {(path: string, body: string, line: number, side: string) => void} [props.onPostComment]
 */
export function DiffViewer({
  activeDiff,
  loading = false,
  isPRMode = false,
  isUnstaged = false,
  showFullDiff = false,
  comments = [],
}) {
  const { theme, themeType } = useTheme();
  const isLoading = typeof loading === 'boolean' ? loading : loading.value;
  const diff = activeDiff.value;
  const patch = diff?.patch;
  const filename = diff?.path ?? '';
  const unstaged = typeof isUnstaged === 'boolean' ? isUnstaged : isUnstaged.value;
  const fullDiff = typeof showFullDiff === 'boolean' ? showFullDiff : showFullDiff.value;

  const wrapperRef = useRef(null);
  const prevFullDiff = useRef(fullDiff);
  const [collapseKey, setCollapseKey] = useState(0);
  const savedScrollTop = useRef(0);

  // Detect expand -> collapse transition and force a remount so the
  // third-party diff library drops its stale per-hunk expansion state.
  useLayoutEffect(() => {
    if (prevFullDiff.current === true && fullDiff === false) {
      savedScrollTop.current = wrapperRef.current?.scrollTop ?? 0;
      setCollapseKey((k) => k + 1);
    }
    prevFullDiff.current = fullDiff;
  }, [fullDiff]);

  // Restore scroll position after the forced remount.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (el && savedScrollTop.current > 0) {
      el.scrollTop = savedScrollTop.current;
      savedScrollTop.current = 0;
    }
  }, [collapseKey]);

  const fileDiff = useMemo(() => {
    if (!patch) return null;
    const meta = processFile(patch, { isGitDiff: true });
    if (!meta) return null;
    // GitHub hunk-only patches used to parse as empty metadata — treat as missing.
    if (!meta.hunks?.length) return null;
    return meta;
  }, [patch]);

  const lineAnnotations = useMemo(() => {
    if (!isPRMode || !comments.length) return [];
    return comments
      .filter((c) => c.path === filename && c.line != null)
      .map((c) => ({
        line: c.line,
        side: 'right',
        render: () => (
          <div class="diff-comment">
            <span class="diff-comment-author">{c.user?.login ?? 'unknown'}</span>
            <span class="diff-comment-body">{c.body}</span>
          </div>
        ),
      }));
  }, [comments, filename, isPRMode]);

  if (isLoading) {
    return (
      <div class="diff-viewer-wrapper diff-loading" aria-busy="true" aria-label="Loading diff">
        <div class="diff-skeleton">
          <div class="diff-skeleton-line wide" />
          <div class="diff-skeleton-line" />
          <div class="diff-skeleton-line mid" />
          <div class="diff-skeleton-line" />
          <div class="diff-skeleton-line short" />
          <div class="diff-skeleton-line mid" />
          <div class="diff-skeleton-line" />
          <div class="diff-skeleton-line wide" />
        </div>
        <style>{diffViewerStyles}</style>
      </div>
    );
  }

  if (!fileDiff) {
    const emptyMessage = isPRMode
      ? 'No patch available for this file. GitHub often omits patches for binary or very large files.'
      : 'No diff available';
    return (
      <div class="diff-empty">
        {emptyMessage}
        <style>{diffViewerStyles}</style>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} class="diff-viewer-wrapper">
      <FileDiff
        key={collapseKey}
        fileDiff={fileDiff}
        edit={unstaged}
        options={{
          theme,
          themeType: themeType === 'light' ? 'light' : 'dark',
          diffStyle: 'unified',
          overflow: 'wrap',
          disableFileHeader: true,
          expandUnchanged: isPRMode || fullDiff,
          collapsedContextThreshold: 1,
          loadDiffFiles: isPRMode
            ? undefined
            : async (meta) => {
              const path = meta.name;
              const staged = !unstaged;
              const res = await api.getFileContents(path, staged);
              const oldFile = res.hasOld
                ? { name: meta.prevName ?? path, contents: res.oldContent }
                : null;
              const newFile = res.hasNew
                ? { name: path, contents: res.newContent }
                : null;
              if (oldFile && newFile) return { oldFile, newFile };
              if (newFile) return { oldFile: null, newFile };
              return { oldFile, newFile: null };
            },
        }}
        lineAnnotations={lineAnnotations}
      />
      <style>{diffViewerStyles}</style>
    </div>
  );
}
