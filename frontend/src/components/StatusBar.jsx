import { useState } from 'preact/hooks';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-preact';
import { BranchPicker } from './BranchPicker.jsx';

/**
 * @param {Object} props
 * @param {() => void} props.onPull
 * @param {() => void} props.onPush
 * @param {number} props.behind
 * @param {number} props.ahead
 * @param {() => void} props.onSelectBranch
 * @param {string} props.currentBranch
 * @param {string[]} props.localBranches
 * @param {string[]} props.remoteBranches
 */
export function StatusBar({ onPull, onPush, behind, ahead, onSelectBranch, currentBranch, localBranches, remoteBranches }) {
  const [hovered, setHovered] = useState(false);

  const hasChanges = behind > 0 || ahead > 0;
  const actionLabel = behind > 0 ? 'Pull' : ahead > 0 ? 'Push' : 'Up to date';
  const handleClick = behind > 0 ? onPull : ahead > 0 ? onPush : null;

  return (
    <div class="status-bar">
      <div class="status-left">
        <BranchPicker
          onSelect={onSelectBranch}
          currentBranch={currentBranch}
          localBranches={localBranches}
          remoteBranches={remoteBranches}
          compact
        />
      </div>

      <div class="status-right">
        {hasChanges && (
          <button
            type="button"
            class={`status-sync-btn${hovered ? ' hovered' : ''}`}
            title={actionLabel}
            onClick={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {behind > 0 && (
              <span class="status-sync-segment">
                <IconArrowDown size={14} />
                <span>{behind}</span>
              </span>
            )}
            {ahead > 0 && (
              <span class="status-sync-segment">
                <IconArrowUp size={14} />
                <span>{ahead}</span>
              </span>
            )}
          </button>
        )}

        {!hasChanges && (
          <span class="status-up-to-date">Up to date</span>
        )}
      </div>

      <style>{`
        .status-bar {
          grid-column: 1 / -1;
          grid-row: 4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: var(--surface);
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-muted);
        }
        .status-left {
          display: flex;
          align-items: center;
          height: 100%;
        }
        .status-left > * {
          height: 100%;
          display: flex;
          align-items: center;
        }
        .status-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-sync-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 8px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .status-sync-btn:hover,
        .status-sync-btn.hovered {
          background: var(--accent-hover);
          color: var(--text);
        }
        .status-sync-segment {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .status-up-to-date {
          font-size: 11px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
