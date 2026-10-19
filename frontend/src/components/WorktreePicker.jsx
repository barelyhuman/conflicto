import { useRef, useState } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconChevronDown, IconFolders, IconTrash } from '@tabler/icons-preact';
import { SearchableMenu } from './SearchableMenu.jsx';
import { buildWorktreeItems, isActiveWorktree } from './worktreeItems.js';

/**
 * Menu half of the picker. Mounted only while open, so it may read the model
 * signals in its body: it needs the plain list to rank and re-renders on change.
 */
function WorktreeMenu({ worktree, workspaceIndex, anchorRef, onClose, onSwitch, onRemove }) {
  const items = buildWorktreeItems(
    worktree.entries.value,
    worktree.currentPath.value,
    workspaceIndex.entries.value
  );

  return (
    <SearchableMenu
      open
      onClose={onClose}
      anchorRef={anchorRef}
      className="worktree-dropdown"
      label="Switch worktree"
      placeholder="Search worktrees…"
      items={items}
      onSelect={(item) => onSwitch?.(item.path)}
      renderBadges={(item) => (
        <>
          {item.isMain && <span class="sm-badge">main</span>}
          {item.current && <span class="sm-badge">current</span>}
          {item.stale && <span class="sm-badge">{item.stale}</span>}
        </>
      )}
      renderAction={(item, { close }) =>
        item.isMain ? null : (
          <button
            type="button"
            class="sm-action"
            title="Remove worktree"
            aria-label={`Remove worktree at ${item.path}`}
            onClick={(e) => {
              e.stopPropagation();
              close();
              onRemove?.(item.path);
            }}
          >
            <IconTrash size={13} stroke={1.75} />
          </button>
        )
      }
    />
  );
}

/**
 * Sidebar dropdown under the project picker: lists the repo's worktrees.
 * Hidden when the repo has only its main worktree.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../models/worktree.js').WorktreeModel>} props.worktree
 * @param {InstanceType<typeof import('../models/workspaceIndex.js').WorkspaceIndexModel>} props.workspaceIndex
 * @param {(path: string) => void} props.onSwitch
 * @param {(path: string) => void} props.onRemove
 */
export function WorktreePicker({ worktree, workspaceIndex, onSwitch, onRemove }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const current = useComputed(() => {
    const path = worktree.currentPath.value;

    return worktree.entries.value.find((wt) => isActiveWorktree(wt, path)) ?? null;
  });
  const label = useComputed(() => {
    const wt = current.value;

    return wt ? wt.branch || wt.head || 'detached' : 'Worktree';
  });
  const title = useComputed(() => current.value?.path ?? 'Switch worktree');
  const isMain = useComputed(() => Boolean(current.value?.isMain));

  return (
    <Show when={() => worktree.entries.value.length > 1}>
      <div class="sidebar-worktree">
        <div class="worktree-picker">
          <button
            ref={triggerRef}
            type="button"
            class="worktree-trigger"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="listbox"
            title={title}
          >
            <IconFolders size={12} stroke={1.75} class="worktree-trigger-icon" />
            <span class="worktree-trigger-name">{label}</span>
            <Show when={isMain}>
              <span class="worktree-trigger-badge">main</span>
            </Show>
            <IconChevronDown size={10} class={open ? 'open' : ''} />
          </button>

          {open && (
            <WorktreeMenu
              worktree={worktree}
              workspaceIndex={workspaceIndex}
              anchorRef={triggerRef}
              onClose={() => setOpen(false)}
              onSwitch={onSwitch}
              onRemove={onRemove}
            />
          )}
        </div>

        <style>{`
          .sidebar-worktree {
            display: flex;
            padding: 0 12px 8px;
            min-width: 0;
          }
          .sidebar.is-searching > .sidebar-worktree {
            display: none;
          }
          .worktree-picker {
            position: relative;
            display: inline-block;
            flex: 1;
            min-width: 0;
          }
          .worktree-trigger {
            display: flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            padding: 2px 6px;
            border: none;
            border-radius: 5px;
            background: transparent;
            color: var(--text-muted);
            font-family: var(--font-sans);
            font-size: 12px;
            line-height: 1.25;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
          }
          .worktree-trigger:hover {
            background: var(--accent-hover);
            color: var(--text);
          }
          .worktree-trigger svg {
            flex-shrink: 0;
          }
          .worktree-trigger svg:last-child {
            transition: transform 0.15s;
          }
          .worktree-trigger svg.open {
            transform: rotate(180deg);
          }
          .worktree-trigger-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .worktree-trigger-badge {
            flex-shrink: 0;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            padding: 1px 4px;
            border-radius: 3px;
            background: var(--accent-bg);
            color: var(--text-muted);
          }
          .anchored-menu.worktree-dropdown {
            min-width: 260px;
          }
        `}</style>
      </div>
    </Show>
  );
}
