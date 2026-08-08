import { useMemo } from 'preact/hooks';
import { FileDiff } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
import { useTheme } from '../theme/ThemeProvider.jsx';

/**
 * @param {Object} props
 * @param {string} props.patch - raw unified diff string
 * @param {string} props.filename
 * @param {boolean} props.isPRMode
 * @param {boolean} props.isUnstaged
 * @param {{ path: string, line: number, body: string, user: { login: string } }[]} props.comments
 * @param {(path: string, body: string, line: number, side: string) => void} props.onPostComment
 */
export function DiffViewer({
  patch,
  filename,
  isPRMode = false,
  isUnstaged = false,
  comments = [],
}) {
  const { theme } = useTheme();

  const fileDiff = useMemo(() => {
    if (!patch) return null;
    const meta = processFile(patch, { isGitDiff: true });
    if (!meta) return null;
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

  if (!fileDiff) {
    return (
      <div class="diff-empty">
        No diff available
        <style>{`
          .diff-empty {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 13px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div class="diff-viewer-wrapper">
      <FileDiff
        fileDiff={fileDiff}
        edit={isUnstaged}
        options={{
          theme,
          themeType: 'dark',
          diffStyle: 'unified',
          overflow: 'wrap',
          disableFileHeader: false,
          stickyHeader: true,
        }}
        lineAnnotations={lineAnnotations}
      />
      <style>{`
        .diff-viewer-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: auto;
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
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}
