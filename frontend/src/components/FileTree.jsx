import { useEffect, useRef, useMemo } from 'preact/hooks';
import { FileTree as PierreTree, prepareFileTreeInput } from '@pierre/trees';

/**
 * @param {Object} props
 * @param {{ path: string, status: 'M'|'A'|'D'|'R'|'C' }[]} props.conflicts
 * @param {{ path: string, status: 'M'|'A'|'D'|'R' }[]} props.staged
 * @param {{ path: string, status: 'M'|'A'|'D'|'R' }[]} props.unstaged
 * @param {{ path: string, status: 'M'|'A'|'D'|'R' }[]} props.prFiles
 * @param {boolean} props.isPRMode
 * @param {string|null} props.activeFile
 * @param {(path: string, isConflict: boolean) => void} props.onSelect
 * @param {(path: string) => void} props.onStage
 * @param {(path: string) => void} props.onUnstage
 */
export function FileTree({
  conflicts,
  staged,
  unstaged,
  prFiles,
  isPRMode,
  activeFile,
  onSelect,
  _onStage,
  _onUnstage,
}) {
  const containerRef = useRef(null);
  const treeRef = useRef(null);

  const model = useMemo(() => {
    const files = isPRMode ? prFiles : [...conflicts, ...staged, ...unstaged];
    const paths = files.map((f) => f.path);
    const prepared = prepareFileTreeInput(paths);
    const gitStatus = files.map((f) => ({
      path: f.path,
      status: mapStatus(f.status),
    }));

    return new PierreTree({
      preparedInput: prepared,
      gitStatus,
      initialSelectedPaths: activeFile ? [activeFile] : [],
      onSelectionChange: (selected) => {
        console.log('[PierreTree] onSelectionChange:', selected);
        if (selected.length > 0) {
          const path = selected[0];
          const isConflict = conflicts.some((c) => c.path === path);
          console.log('[PierreTree] selecting path:', path, 'isConflict:', isConflict);
          onSelect?.(path, isConflict);
        }
      },
    });
  }, [conflicts, staged, unstaged, prFiles, isPRMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (containerRef.current && !treeRef.current) {
      model.render({ containerWrapper: containerRef.current });
      treeRef.current = model;
    }
    return () => {
      treeRef.current?.unmount();
      treeRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    if (activeFile) {
      model.focusPath(activeFile);
    }
  }, [activeFile, model]);

  // Fallback click interceptor: Pierre Tree internal click-to-select
  // sometimes fails across the Preact 10/11 shadow-DOM boundary.
  // Because the tree renders inside a shadow root, `event.target` is
  // retargeted to the host element. We use `composedPath()` to walk
  // through shadow-DOM elements and find the actual row that was clicked.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event) => {
      // composedPath includes the full event path through shadow boundaries
      const path = event.composedPath?.() ?? [];
      const row = path.find(
        (el) => el instanceof HTMLElement && el.hasAttribute('data-item-path')
      );
      if (!row) return;

      const clickedPath = row.getAttribute('data-item-path');
      if (!clickedPath) return;

      // Ignore clicks on already-selected item to avoid double-firing
      // when the tree's own selection *does* work.
      if (clickedPath === activeFile) return;

      const isConflict = conflicts.some((c) => c.path === clickedPath);
      console.log('[FileTree fallback click] path:', clickedPath, 'isConflict:', isConflict);
      onSelect?.(clickedPath, isConflict);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onSelect, conflicts, activeFile]);

  return (
    <div
      ref={containerRef}
      class="file-tree"
      style="height: 100%; overflow: hidden;"
    />
  );
}

function mapStatus(status) {
  switch (status) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'M': return 'modified';
    case 'R': return 'renamed';
    case 'C': return 'modified';
    default: return 'untracked';
  }
}
