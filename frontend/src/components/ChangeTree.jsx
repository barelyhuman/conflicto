import { useMemo, useState, useCallback } from 'preact/hooks';
import {IconPlus,IconMinus, IconArrowBackUp} from "@tabler/icons-preact"

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
  // Paths in this set are collapsed (default: all expanded).
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
        {flatFiles.map((file) => (
          <FileRow
            key={file.path}
            path={file.path}
            label={file.path}
            status={file.status}
            title={file.path}
            active={activeFile === file.path}
            pad={8}
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
 * @param {string} props.label
 * @param {string} [props.status]
 * @param {string} [props.title]
 * @param {boolean} props.active
 * @param {number} props.pad
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
  label,
  status,
  title,
  active,
  pad,
  onSelect,
  showStage,
  showUnstage,
  showDiscard,
  onStage,
  onUnstage,
  onDiscard,
}) {
  return (
    <div
      class={`change-tree-row change-tree-file${active ? ' active' : ''}`}
      style={`padding-left: ${pad}px`}
      role="listitem"
      aria-selected={active}
    >
      <button
        type="button"
        class="change-tree-file-main"
        title={title}
        onClick={() => onSelect?.(path)}
      >
        {status && (
          <span class="change-tree-status">{status}</span>
        )}
        <span class="change-tree-name">{label}</span>
      </button>
      <div class="change-tree-actions">
        {showDiscard && (
          <button
            type="button"
            class="change-tree-action"
            title="Discard changes"
            aria-label="Discard changes"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard?.(path);
            }}
          >
            <IconArrowBackUp size={14} />
          </button>
        )}
        {showStage && (
          <button
            type="button"
            class="change-tree-action"
            title="Stage"
            aria-label="Stage"
            onClick={(e) => {
              e.stopPropagation();
              onStage?.(path);
            }}
          >
            <IconPlus size={14} />
          </button>
        )}
        {showUnstage && (
          <button
            type="button"
            class="change-tree-action"
            title="Unstage"
            aria-label="Unstage"
            onClick={(e) => {
              e.stopPropagation();
              onUnstage?.(path);
            }}
          >
            <IconMinus size={14}/>
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
            ▸
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
    <FileRow
      path={node.path}
      label={node.name}
      status={node.status}
      active={isActive}
      pad={pad}
      onSelect={onSelect}
      showStage={showStage}
      showUnstage={showUnstage}
      showDiscard={showDiscard}
      onStage={onStage}
      onUnstage={onUnstage}
      onDiscard={onDiscard}
    />
  );
}
