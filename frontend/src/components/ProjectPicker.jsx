import { useState, useRef } from 'preact/hooks';
import { IconChevronDown, IconFolder } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';

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

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        alignment="start"
        offset={6}
        className="project-dropdown"
      >
        {recents.length > 0 && (
          <div class="project-group">
            {recents.map((p) => (
              <button
                key={p.path}
                type="button"
                class={`project-option${p.path === currentPath ? ' active' : ''}`}
                onClick={() => select(p.path)}
                title={p.path}
              >
                <IconFolder size={14} />
                <span class="project-option-info">
                  <span class="project-option-name">{p.name}</span>
                  <span class="project-option-path">{p.path}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div class="project-divider" />

        <button
          type="button"
          class="project-option project-option-open"
          onClick={openFolder}
        >
          <IconFolder size={14} />
          <span class="project-option-info">
            <span class="project-option-name">Open Other Folder...</span>
          </span>
        </button>
      </AnchoredMenu>

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
          max-width: 360px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .project-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .project-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 4px 0;
        }
        .project-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
          padding: 6px 8px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .project-option:hover {
          background: var(--accent-bg);
        }
        .project-option.active {
          color: var(--text-h);
          background: var(--accent-bg);
        }
        .project-option svg {
          flex-shrink: 0;
          color: var(--text-muted);
        }
        .project-option-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .project-option-name {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-option-path {
          font-size: 11px;
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-option-open .project-option-name {
          color: var(--text-muted);
        }
        .project-option-open:hover .project-option-name {
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
