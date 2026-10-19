import { useState, useRef, useMemo } from 'preact/hooks';
import { IconChevronDown, IconFolder } from '@tabler/icons-preact';
import { SearchableMenu } from './SearchableMenu.jsx';

/**
 * @param {Object} props
 * @param {string} props.currentName
 * @param {string} props.currentPath
 * @param {Array<{name: string, path: string, openedAt: string}>} props.recents
 * @param {(path: string) => void} props.onSwitchProject
 * @param {() => void} props.onOpenProject
 */
export function ProjectPicker({ currentName, currentPath, recents, onSwitchProject, onOpenProject }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  function select(path) {
    onSwitchProject?.(path);
    setOpen(false);
  }

  function openFolder() {
    onOpenProject?.();
    setOpen(false);
  }

  const items = useMemo(
    () =>
      recents.map((p) => ({
        id: p.path,
        label: p.name,
        sublabel: p.path,
        title: p.path,
        current: p.path === currentPath,
      })),
    [recents, currentPath]
  );

  const displayName = currentName || 'No project';

  return (
    <div class="project-picker">
      <button
        ref={triggerRef}
        type="button"
        class="project-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={currentPath || 'Click to open a project'}
      >
        <span class="project-name">{displayName}</span>
        <IconChevronDown size={10} class={open ? 'open' : ''} />
      </button>

      <SearchableMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        offset={6}
        className="project-dropdown"
        label="Switch project"
        placeholder="Search projects…"
        items={items}
        onSelect={(item) => select(item.id)}
        renderIcon={() => <IconFolder size={14} />}
        footer={
          <button type="button" class="sm-footer-btn" onClick={openFolder}>
            <IconFolder size={14} />
            <span>Open Other Folder...</span>
          </button>
        }
      />

      <style>{`
        .project-picker {
          position: relative;
          display: inline-block;
        }
        .project-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 6px;
          border-radius: 5px;
          border: none;
          background: transparent;
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.25;
          cursor: pointer;
          transition: background 0.15s;
        }
        .project-trigger:hover {
          background: var(--accent-hover);
        }
        .project-trigger svg {
          transition: transform 0.15s;
          color: var(--text-muted);
        }
        .project-trigger svg.open {
          transform: rotate(180deg);
        }
        .project-name {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .anchored-menu.project-dropdown {
          min-width: 280px;
        }
        .anchored-menu.project-dropdown .sm-sub {
          font-size: 11px;
          font-family: var(--font-sans);
        }
      `}</style>
    </div>
  );
}
