import { useMemo, useState, useCallback } from 'preact/hooks';
import { IconArrowBackUp, IconChevronRight } from '@tabler/icons-preact';

/**
 * @typedef {{ name: string, path: string, status?: string, children?: TreeNode[] }} TreeNode
 */

/**
 * Build a nested folder/file tree from flat path entries.
 * @param {{ path: string, status: string }[]} files
 * @returns {TreeNode[]}
 */
export function buildFileTree(files) {
  /** @type {Map<string, TreeNode>} */
  const root = new Map();

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    /** @type {Map<string, TreeNode>} */
    let level = root;
    let acc = '';

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      acc = acc ? `${acc}/${name}` : name;
      const isFile = i === parts.length - 1;

      let node = level.get(name);
      if (!node) {
        node = isFile
          ? { name, path: acc, status: file.status }
          : { name, path: acc, children: [] };
        level.set(name, node);
      } else if (isFile) {
        node.status = file.status;
        delete node.children;
      } else if (!node.children) {
        node.children = [];
      }

      if (!isFile) {
        if (!node.children) node.children = [];
        if (!node._childMap) {
          node._childMap = new Map(node.children.map((c) => [c.name, c]));
        }
        level = node._childMap;
      }
    }
  }

  return finalize(root);
}

/**
 * @param {Map<string, TreeNode>} map
 * @returns {TreeNode[]}
 */
function finalize(map) {
  const nodes = [...map.values()];
  for (const node of nodes) {
    if (node._childMap) {
      node.children = finalize(node._childMap);
      delete node._childMap;
    } else if (node.children) {
      node.children = sortNodes(node.children);
    }
  }
  return sortNodes(nodes);
}

/**
 * Folders first, then files; alphabetical within each group.
 * @param {TreeNode[]} nodes
 */
function sortNodes(nodes) {
  return [...nodes].sort((a, b) => {
    const aDir = a.children != null;
    const bDir = b.children != null;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * @param {{ path: string, status: string }[]} files
 * @returns {{ path: string, status: string }[]}
 */
function sortFlatFiles(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Split a path into basename + directory suffix for the file row layout.
 * @param {string} path
 * @returns {{ name: string, dir: string }}
 */
export function splitPath(path) {
  const idx = path.lastIndexOf('/');
  if (idx < 0) return { name: path, dir: './' };
  return { name: path.slice(idx + 1), dir: path.slice(0, idx + 1) };
}

/**
 * Map git status letter → badge class + glyph.
 * @param {string} [status]
 * @returns {{ glyph: string, kind: string }}
 */
export function statusBadge(status) {
  const s = (status || 'M').toUpperCase().charAt(0);
  switch (s) {
    case 'A':
    case 'U':
    case '?':
      return { glyph: 'A', kind: 'added' };
    case 'D':
      return { glyph: 'D', kind: 'deleted' };
    case 'C':
      return { glyph: 'C', kind: 'conflict' };
    case 'R':
    case 'M':
    default:
      return { glyph: s === 'R' ? 'M' : s || 'M', kind: 'modified' };
  }
}

/**
 * Custom change list for the sidebar.
 *
 * @param {Object} props
 * @param {{ path: string, status: string }[]} props.files
 * @param {string|null} props.activeFile
 * @param {(path: string) => void} props.onSelect
 * @param {boolean} [props.flat] - flat full-path list (local diffs); nested tree when false (PR)
 * @param {boolean} [props.showStage]
 * @param {boolean} [props.showUnstage]
 * @param {boolean} [props.showDiscard]
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 */
export function ChangeTree({
  files,
  activeFile,
  onSelect,
  flat = false,
  showStage = false,
  showUnstage = false,
  showDiscard = false,
  onStage,
  onUnstage,
  onDiscard,
}) {
  const tree = useMemo(() => (flat ? null : buildFileTree(files)), [files, flat]);
  const flatFiles = useMemo(() => (flat ? sortFlatFiles(files) : null), [files, flat]);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleFolder = useCallback((path) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (files.length === 0) return null;

  if (flat) {
    return (
      <div class="change-tree change-tree-flat" role="list">
        {flatFiles.map((file) => {
          const { name, dir } = splitPath(file.path);
          return (
            <FileRow
              key={file.path}
              path={file.path}
              name={name}
              dir={dir}
              status={file.status}
              title={file.path}
              active={activeFile === file.path}
              onSelect={onSelect}
              showStage={showStage}
              showUnstage={showUnstage}
              showDiscard={showDiscard}
              onStage={onStage}
              onUnstage={onUnstage}
              onDiscard={onDiscard}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div class="change-tree" role="tree">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          activeFile={activeFile}
          collapsed={collapsed}
          onToggleFolder={toggleFolder}
          onSelect={onSelect}
          showStage={showStage}
          showUnstage={showUnstage}
          showDiscard={showDiscard}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
        />
      ))}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} props.path
 * @param {string} props.name
 * @param {string} [props.dir]
 * @param {string} [props.status]
 * @param {string} [props.title]
 * @param {boolean} props.active
 * @param {(path: string) => void} props.onSelect
 * @param {boolean} props.showStage
 * @param {boolean} props.showUnstage
 * @param {boolean} props.showDiscard
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 */
function FileRow({
  path,
  name,
  dir,
  status,
  title,
  active,
  onSelect,
  showStage,
  showUnstage,
  showDiscard,
  onStage,
  onUnstage,
  onDiscard,
}) {
  const badge = statusBadge(status);

  return (
    <div
      class={`file-row change-tree-row change-tree-file${active ? ' active' : ''}`}
      role="listitem"
      aria-selected={active}
    >
      <button
        type="button"
        class="change-tree-file-main"
        title={title}
        onClick={() => onSelect?.(path)}
      >
        <span class={`status-badge ${badge.kind}`}>{badge.glyph}</span>
        <span class="file-name">{name}</span>
        {dir != null && <span class="file-path">{dir}</span>}
      </button>
      <div class="row-actions change-tree-actions">
        {showDiscard && (
          <button
            type="button"
            class="revert-btn"
            title="Revert changes"
            aria-label="Revert changes"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard?.(path);
            }}
          >
            <IconArrowBackUp size={10} stroke={2.2} />
          </button>
        )}
        {showStage && (
          <button
            type="button"
            class="stage-btn"
            title="Stage"
            aria-label="Stage"
            onClick={(e) => {
              e.stopPropagation();
              onStage?.(path);
            }}
          >
            +
          </button>
        )}
        {showUnstage && (
          <button
            type="button"
            class="stage-btn"
            title="Unstage"
            aria-label="Unstage"
            onClick={(e) => {
              e.stopPropagation();
              onUnstage?.(path);
            }}
          >
            −
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {TreeNode} props.node
 * @param {number} props.depth
 * @param {string|null} props.activeFile
 * @param {Set<string>} props.collapsed
 * @param {(path: string) => void} props.onToggleFolder
 * @param {(path: string) => void} props.onSelect
 * @param {boolean} props.showStage
 * @param {boolean} props.showUnstage
 * @param {boolean} props.showDiscard
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 */
function TreeNodeRow({
  node,
  depth,
  activeFile,
  collapsed,
  onToggleFolder,
  onSelect,
  showStage,
  showUnstage,
  showDiscard,
  onStage,
  onUnstage,
  onDiscard,
}) {
  const isFolder = node.children != null;
  const isOpen = isFolder && !collapsed.has(node.path);
  const isActive = !isFolder && activeFile === node.path;
  const pad = 8 + depth * 12;

  if (isFolder) {
    return (
      <>
        <button
          type="button"
          class="change-tree-row change-tree-folder"
          style={`padding-left: ${pad}px`}
          role="treeitem"
          aria-expanded={isOpen}
          onClick={() => onToggleFolder(node.path)}
        >
          <span class={`change-tree-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
            <IconChevronRight size={10} stroke={1.5} />
          </span>
          <span class="change-tree-name">{node.name}</span>
        </button>
        {isOpen &&
          node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              collapsed={collapsed}
              onToggleFolder={onToggleFolder}
              onSelect={onSelect}
              showStage={showStage}
              showUnstage={showUnstage}
              showDiscard={showDiscard}
              onStage={onStage}
              onUnstage={onUnstage}
              onDiscard={onDiscard}
            />
          ))}
      </>
    );
  }

  return (
    <div style={`padding-left: ${Math.max(0, depth * 12)}px`}>
      <FileRow
        path={node.path}
        name={node.name}
        status={node.status}
        active={isActive}
        onSelect={onSelect}
        showStage={showStage}
        showUnstage={showUnstage}
        showDiscard={showDiscard}
        onStage={onStage}
        onUnstage={onUnstage}
        onDiscard={onDiscard}
      />
    </div>
  );
}
