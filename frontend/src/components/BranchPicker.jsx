import { useState, useRef, useMemo } from 'preact/hooks';
import { IconChevronDown } from '@tabler/icons-preact';
import { SearchableMenu } from './SearchableMenu.jsx';

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

  const items = useMemo(
    () => [
      ...localBranches.map((b) => ({ id: `local:${b}`, label: b, group: 'Local', current: currentBranch === b })),
      ...remoteBranches.map((b) => ({ id: `remote:${b}`, label: b, group: 'Remote', current: currentBranch === b })),
    ],
    [localBranches, remoteBranches, currentBranch]
  );

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

      <SearchableMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        className="branch-dropdown"
        label="Switch branch"
        placeholder="Search branches…"
        mono
        items={items}
        onSelect={(item) => select(item.label)}
      />

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
          max-width: 300px;
        }
      `}</style>
    </div>
  );
}
