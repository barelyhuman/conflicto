import { useMemo } from 'preact/hooks';
import { UnresolvedFile } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { SidebarToggle } from './SidebarToggle.jsx';

/**
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<{ path?: string, patch?: string }|null>} props.activeDiff
 * @param {boolean} [props.sidebarOpen]
 * @param {() => void} [props.onToggleSidebar]
 */
export function ConflictViewer({ activeDiff, sidebarOpen = true, onToggleSidebar }) {
  const { theme, themeType } = useTheme();
  const patch = activeDiff.value?.patch;

  const fileDiff = useMemo(() => {
    if (!patch) return null;
    const meta = processFile(patch, { isGitDiff: true });
    if (!meta) return null;
    return meta;
  }, [patch]);

  if (!fileDiff) {
    return (
      <div class="diff-empty">
        No conflict data available
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
    <div class="conflict-viewer-wrapper">
      <UnresolvedFile
        fileDiff={fileDiff}
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
      />
      <style>{`
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
      `}</style>
    </div>
  );
}
