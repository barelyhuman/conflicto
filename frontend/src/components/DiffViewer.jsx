import { useMemo } from 'preact/hooks';
import { FileDiff } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
import { useTheme } from '../theme/ThemeProvider.jsx';

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
 * @param {{ path: string, line: number, body: string, user: { login: string } }[]} props.comments
 * @param {(path: string, body: string, line: number, side: string) => void} [props.onPostComment]
 */
export function DiffViewer({
  activeDiff,
  loading = false,
  isPRMode = false,
  isUnstaged = false,
  comments = [],
}) {
  const { theme, themeType } = useTheme();
  const isLoading = typeof loading === 'boolean' ? loading : loading.value;
  const diff = activeDiff.value;
  const patch = diff?.patch;
  const filename = diff?.path ?? '';
  const unstaged = typeof isUnstaged === 'boolean' ? isUnstaged : isUnstaged.value;

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
    <div class="diff-viewer-wrapper">
      <FileDiff
        fileDiff={fileDiff}
        edit={unstaged}
        options={{
          theme,
          themeType: themeType === 'light' ? 'light' : 'dark',
          diffStyle: 'unified',
          overflow: 'wrap',
          disableFileHeader: true,
        }}
        lineAnnotations={lineAnnotations}
      />
      <style>{diffViewerStyles}</style>
    </div>
  );
}
