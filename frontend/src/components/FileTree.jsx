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
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;

  // Content key so new array identities with the same files do not remount the tree
  // (e.g. App re-renders from activeFile / activeDiff, or stable EMPTY_FILES swaps).
  const fileListKey = useMemo(() => {
    const files = isPRMode ? prFiles : [...conflicts, ...staged, ...unstaged];
    return `${isPRMode ? 'pr' : 'local'}\0${files.map((f) => `${f.path}:${f.status}`).join('\0')}`;
  }, [conflicts, staged, unstaged, prFiles, isPRMode]);

  const model = useMemo(() => {
    const files = isPRMode ? prFiles : [...conflicts, ...staged, ...unstaged];
    const paths = files.map((f) => f.path);
    const filePathSet = new Set(paths);
    const prepared = prepareFileTreeInput(paths);
    const gitStatus = files.map((f) => ({
      path: f.path,
      status: mapStatus(f.status),
    }));

    const tree = new PierreTree({
      preparedInput: prepared,
      gitStatus,
      initialExpansion: 'open',
      unsafeCSS: `
        :host {
          --trees-bg-override: #111111;
          --trees-accent-override: #f5f5f5;
          --trees-status-added-override: #737373;
          --trees-status-modified-override: #737373;
          --trees-status-deleted-override: #737373;
          --trees-status-renamed-override: #737373;
          --trees-status-untracked-override: #737373;
          --trees-file-icon-color: #737373;
          --trees-selected-bg-override: #1a1a1a;
          --trees-selected-fg-override: #f5f5f5;
          --trees-focus-ring-color-override: #737373;
          --trees-bg-muted-override: #171717;
        }
      `,
      initialSelectedPaths: activeFileRef.current ? [activeFileRef.current] : [],
      onSelectionChange: (selected) => {
        if (selected.length === 0) return;
        const path = selected[0];
        // Directories are synthetic path prefixes — only real files trigger onSelect.
        if (!filePathSet.has(path)) {
          const current = activeFileRef.current;
          if (current) {
            tree.focusPath(current);
          }
          return;
        }
        const isConflict = conflictsRef.current.some((c) => c.path === path);
        onSelectRef.current?.(path, isConflict);
      },
    });
    return tree;
  }, [fileListKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // Folders only expand/collapse — never select for diff viewing.
      if (row.getAttribute('data-item-type') === 'folder') return;

      const clickedPath = row.getAttribute('data-item-path');
      if (!clickedPath) return;

      // Ignore clicks on already-selected item to avoid double-firing
      // when the tree's own selection *does* work.
      if (clickedPath === activeFileRef.current) return;

      const isConflict = conflictsRef.current.some((c) => c.path === clickedPath);
      onSelectRef.current?.(clickedPath, isConflict);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [model]);

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
