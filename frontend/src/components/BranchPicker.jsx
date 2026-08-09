import { useState, useRef } from 'preact/hooks';
import { IconChevronDown } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';

/**
 * @param {Object} props
 * @param {(branch: string) => void} props.onSelect
 * @param {string} props.currentBranch
 * @param {boolean} [props.compact]
 * @param {boolean} [props.pill] - monochrome island pill style for sidebar
 * @param {import('preact').ComponentChildren} [props.icon]
 * @param {string[]} props.localBranches
 * @param {string[]} props.remoteBranches
 */
export function BranchPicker({
  onSelect,
  currentBranch,
  compact,
  pill,
  icon,
  localBranches = [],
  remoteBranches = [],
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  function select(branch) {
    onSelect?.(branch);
    setOpen(false);
  }

  const triggerClass = [
    'branch-trigger',
    compact ? 'compact' : '',
    pill ? 'pill' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div class="branch-picker">
      <button
        ref={triggerRef}
        type="button"
        class={triggerClass}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={currentBranch || 'main'}
      >
        {icon}
        <span class="branch-current">{currentBranch || 'main'}</span>
        {!pill && <IconChevronDown size={10} class={open ? 'open' : ''} />}
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        alignment="start"
        offset={4}
        className="branch-dropdown"
      >
        <div class="branch-group">
          <div class="branch-group-label">Local</div>
          {localBranches.map((b) => (
            <button
              key={b}
              type="button"
              class={`branch-option${currentBranch === b ? ' active' : ''}`}
              onClick={() => select(b)}
            >
              {b}
            </button>
          ))}
        </div>
        <div class="branch-group">
          <div class="branch-group-label">Remote</div>
          {remoteBranches.map((b) => (
            <button
              key={b}
              type="button"
              class={`branch-option${currentBranch === b ? ' active' : ''}`}
              onClick={() => select(b)}
            >
              {b}
            </button>
          ))}
        </div>
      </AnchoredMenu>

      <style>{`
        .branch-picker {
          position: relative;
          display: inline-block;
          min-width: 0;
        }
        .branch-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px;
          border-radius: 6px;
          border: none;
          background: var(--card-bg);
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .branch-trigger:hover {
          background: rgba(127, 127, 127, 0.16);
        }
        .branch-trigger.compact:not(.pill) {
          border: none;
          background: transparent;
          padding: 0 10px;
          height: 100%;
          border-radius: 0;
          gap: 6px;
        }
        .branch-trigger.compact:not(.pill):hover {
          background: rgba(127, 127, 127, 0.14);
        }
        .branch-trigger svg {
          transition: transform 0.15s;
          color: var(--grey);
          flex-shrink: 0;
        }
        .branch-trigger svg.open {
          transform: rotate(180deg);
        }
        .branch-current {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .anchored-menu.branch-dropdown {
          min-width: 220px;
          max-width: 280px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .branch-group-label {
          padding: 6px 10px 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--grey);
        }
        .branch-option {
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.1s;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .branch-option:hover {
          background: rgba(127, 127, 127, 0.12);
        }
        .branch-option.active {
          color: var(--text);
          background: rgba(127, 127, 127, 0.16);
        }
      `}</style>
    </div>
  );
}
