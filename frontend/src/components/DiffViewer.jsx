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
export function DiffViewer({ patch, filename, isPRMode = false, isUnstaged = false, comments = [] }) {
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
          unsafeCSS: `
            :host {
              /* Flush with app surface */
              --diffs-bg: #111111;
              --diffs-dark-bg: #111111;
              --diffs-bg-context-override: #111111;
              --diffs-bg-context-gutter-override: #111111;
              --diffs-bg-separator-override: #1a1a1a;
              --diffs-bg-buffer-override: #1a1a1a;

              /* Additions: black text on white */
              --diffs-addition-color-override: #0a0a0a;
              --diffs-bg-addition-override: #ffffff;
              --diffs-bg-addition-number-override: #ffffff;
              --diffs-fg-number-addition-override: #0a0a0a;
              --diffs-bg-addition-emphasis-override: #e5e5e5;

              /* Removals: light text on muted red */
              --diffs-deletion-color-override: #e5e5e5;
              --diffs-bg-deletion-override: #2a1515;
              --diffs-bg-deletion-number-override: #2a1515;
              --diffs-fg-number-deletion-override: #e5e5e5;
              --diffs-bg-deletion-emphasis-override: rgba(255,255,255,0.06);

              /* Modified/neutral */
              --diffs-modified-color-override: #a3a3a3;
            }

            /* Force pure white for additions — bypass library color-mix() */
            [data-background] [data-line-type="change-addition"] {
              --diffs-computed-diff-line-bg: #ffffff !important;
              --diffs-hover-mix-target: #f5f5f5 !important;
              color: #111111 !important;
            }
            [data-background] [data-line-type="change-addition"] span {
              color: #111111 !important;
            }

            /* Force muted red for deletions — bypass library color-mix() */
            [data-background] [data-line-type="change-deletion"] {
              --diffs-computed-diff-line-bg: #2a1515 !important;
              --diffs-hover-mix-target: #3a2525 !important;
            }

            /* Force context lines to sit flush */
            [data-background] [data-line]:not([data-line-type="change-addition"]):not([data-line-type="change-deletion"]) {
              --diffs-computed-decoration-bg: #111111 !important;
              --diffs-hover-mix-target: #1a1a1a !important;
            }
          `,
        }}
        lineAnnotations={lineAnnotations}
      />
      <style>{`
        .diff-viewer-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
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
