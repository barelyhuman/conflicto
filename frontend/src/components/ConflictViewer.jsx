import { useMemo } from 'preact/hooks';
import { UnresolvedFile } from '@pierre/diffs/react';
import { processFile } from '@pierre/diffs';
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
 * @param {Object} props
 * @param {import('@preact/signals-core').Signal<{ path?: string, patch?: string }|null>} props.activeDiff
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.loading]
 */
export function ConflictViewer({ activeDiff, loading = false }) {
  const { theme, themeType } = useTheme();
  const isLoading = typeof loading === 'boolean' ? loading : loading.value;
  const patch = activeDiff.value?.patch;

  const fileDiff = useMemo(() => {
    if (!patch) return null;
    const meta = processFile(patch, { isGitDiff: true });
    if (!meta) return null;
    return meta;
  }, [patch]);

  if (isLoading) {
    return (
      <div class="conflict-viewer-wrapper diff-loading" aria-busy="true" aria-label="Loading conflict">
        <div class="diff-skeleton">
          <div class="diff-skeleton-line wide" />
          <div class="diff-skeleton-line" />
          <div class="diff-skeleton-line mid" />
          <div class="diff-skeleton-line" />
          <div class="diff-skeleton-line short" />
          <div class="diff-skeleton-line mid" />
        </div>
        <style>{conflictStyles}</style>
      </div>
    );
  }

  if (!fileDiff) {
    return (
      <div class="diff-empty">
        No conflict data available
        <style>{conflictStyles}</style>
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
          disableFileHeader: true,
        }}
      />
      <style>{conflictStyles}</style>
    </div>
  );
}
