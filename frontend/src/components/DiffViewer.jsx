import { useMemo } from 'preact/hooks';
import { FileDiff } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { SidebarToggle } from './SidebarToggle.jsx';

/**
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<{ path?: string, patch?: string }|null>} props.activeDiff
 * @param {boolean} props.isPRMode
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.isUnstaged
 * @param {{ path: string, line: number, body: string, user: { login: string } }[]} props.comments
 * @param {(path: string, body: string, line: number, side: string) => void} [props.onPostComment]
 * @param {boolean} [props.sidebarOpen]
 * @param {() => void} [props.onToggleSidebar]
 */
export function DiffViewer({
  activeDiff,
  isPRMode = false,
  isUnstaged = false,
  comments = [],
  sidebarOpen = true,
  onToggleSidebar,
}) {
  const { theme, themeType } = useTheme();
  const diff = activeDiff.value;
  const patch = diff?.patch;
  const filename = diff?.path ?? '';
  const unstaged = typeof isUnstaged === 'boolean' ? isUnstaged : isUnstaged.value;

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
        edit={unstaged}
        options={{
          theme,
          themeType: themeType === 'light' ? 'light' : 'dark',
          diffStyle: 'unified',
          overflow: 'wrap',
          disableFileHeader: false,
          stickyHeader: true,
        }}
        renderHeaderPrefix={
          onToggleSidebar
            ? () => (
                <SidebarToggle
                  open={sidebarOpen}
                  onToggle={onToggleSidebar}
                  className="diffs-header-sidebar-toggle"
                />
              )
            : undefined
        }
        lineAnnotations={lineAnnotations}
      />
      <style>{`
        .diff-viewer-wrapper {
          display: flex;
          flex: 1;
          flex-direction: column;
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
