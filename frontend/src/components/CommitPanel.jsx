import { useState } from 'preact/hooks';

/**
 * @param {string} branch
 * @param {number} [max]
 */
function truncateBranch(branch, max = 18) {
  const name = branch || 'main';
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/**
 * Commit message draft + submit. Owns local state so typing does not re-render App.
 * Pinned at the bottom of the sidebar per the island design.
 *
 * @param {Object} props
 * @param {number|import('@preact/signals-core').Signal<number>} props.stagedCount
 * @param {string} [props.currentBranch]
 * @param {(message: string) => void | Promise<void>} [props.onCommit]
 */
export function CommitPanel({ stagedCount, currentBranch = 'main', onCommit }) {
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const count =
    typeof stagedCount === 'object' && stagedCount != null && 'value' in stagedCount
      ? stagedCount.value
      : /** @type {number} */ (stagedCount ?? 0);

  const canCommit = count > 0 && commitMessage.trim().length > 0 && !committing;
  const branch = currentBranch || 'main';
  const shortBranch = truncateBranch(branch);
  const modKey =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘'
      : 'Ctrl';

  async function submit() {
    const message = commitMessage.trim();
    if (!message || count === 0 || committing) return;
    setCommitting(true);
    try {
      await onCommit?.(message);
      setCommitMessage('');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div class="commit-footer commit-panel">
      <textarea
        class="commit-input commit-message-input"
        rows={2}
        placeholder={
          count > 0
            ? `Commit message (${modKey}+Enter)`
            : 'Commit message'
        }
        value={commitMessage}
        onInput={(e) => setCommitMessage(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCommit) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={committing}
      />
      <button
        type="button"
        class={`commit-btn commit-button${canCommit ? ' enabled' : ''}`}
        disabled={!canCommit}
        title={`Commit to ${branch}`}
        onClick={() => submit()}
      >
        {committing ? 'Committing…' : `Commit to ${shortBranch}`}
      </button>
    </div>
  );
}
