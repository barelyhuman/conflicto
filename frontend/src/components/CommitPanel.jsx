import { useState } from 'preact/hooks';

/**
 * Commit message draft + submit. Owns local state so typing does not re-render App.
 *
 * @param {Object} props
 * @param {number} props.stagedCount
 * @param {(message: string) => void | Promise<void>} [props.onCommit]
 */
export function CommitPanel({ stagedCount, onCommit }) {
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const canCommit = stagedCount > 0 && commitMessage.trim().length > 0 && !committing;
  const modKey =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘'
      : 'Ctrl';

  async function submit() {
    const message = commitMessage.trim();
    if (!message || stagedCount === 0 || committing) return;
    setCommitting(true);
    try {
      await onCommit?.(message);
      setCommitMessage('');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div class="commit-panel">
      <textarea
        class="commit-message-input"
        rows={3}
        placeholder={
          stagedCount > 0
            ? `Message (${modKey}+Enter to commit)`
            : 'Stage changes to commit'
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
        class="commit-button"
        disabled={!canCommit}
        onClick={() => submit()}
      >
        {committing
          ? 'Committing…'
          : stagedCount > 0
            ? `Commit ${stagedCount} file${stagedCount === 1 ? '' : 's'}`
            : 'Commit'}
      </button>
    </div>
  );
}
