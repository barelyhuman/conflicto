import { IconGitBranch, IconArrowUp, IconArrowDown } from '@tabler/icons-preact';
import { BranchPicker } from './BranchPicker.jsx';

/**
 * Sidebar actions row: branch pill + pull/push with presence badges.
 * PR controls live in the content island header.
 *
 * @param {Object} props
 * @param {string} props.currentBranch
 * @param {string[]} props.localBranches
 * @param {string[]} props.remoteBranches
 * @param {(branch: string) => void} props.onSelectBranch
 * @param {number} props.behind
 * @param {number} props.ahead
 * @param {() => void} props.onPull
 * @param {() => void} props.onPush
 */
export function SidebarActions({
  currentBranch,
  localBranches,
  remoteBranches,
  onSelectBranch,
  behind,
  ahead,
  onPull,
  onPush,
}) {
  return (
    <div class="actions-row">
      <BranchPicker
        onSelect={onSelectBranch}
        currentBranch={currentBranch}
        localBranches={localBranches}
        remoteBranches={remoteBranches}
        compact
        pill
        icon={<IconGitBranch size={11} stroke={2} />}
      />
      <div class="actions-row-end">
        <div class="sync-actions">
          <button
            type="button"
            class="icon-btn"
            title={behind > 0 ? `Pull (${behind})` : 'Pull'}
            aria-label="Pull"
            onClick={onPull}
            disabled={behind <= 0}
          >
            <IconArrowDown size={13} stroke={2} />
            {behind > 0 && <span class="dot-badge" aria-hidden="true" />}
          </button>
          <button
            type="button"
            class="icon-btn"
            title={ahead > 0 ? `Push (${ahead})` : 'Push'}
            aria-label="Push"
            onClick={onPush}
            disabled={ahead <= 0}
          >
            <IconArrowUp size={13} stroke={2} />
            {ahead > 0 && <span class="dot-badge" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
