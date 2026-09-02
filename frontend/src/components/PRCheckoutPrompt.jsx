import { useState, useEffect } from 'preact/hooks';
import { api } from '../wails.js';

/**
 * Prompt shown when a PR is selected offering checkout options.
 * @param {Object} props
 * @param {{ number: number, title: string, author: string, baseBranch: string } | null} props.pr
 * @param {() => void} props.onViewDiff
 * @param {() => void} props.onCheckoutLocal
 * @param {(hash: string) => void} props.onCheckoutWorktree
 * @param {() => void} props.onClose
 */
export function PRCheckoutPrompt({ pr, onViewDiff, onCheckoutLocal, onCheckoutWorktree, onClose }) {
  const [mode, setMode] = useState(null); // null | 'local' | 'worktree'
  const [worktreePath, setWorktreePath] = useState('');
  const [worktreeHash, setWorktreeHash] = useState('');
  const [worktreePreviewLoading, setWorktreePreviewLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'worktree') {
      setWorktreePath('');
      setWorktreeHash('');
      setWorktreePreviewLoading(false);
      return;
    }

    let cancelled = false;
    setWorktreePreviewLoading(true);

    api.previewWorktreePath()
      .then((preview) => {
        if (cancelled) return;
        setWorktreePath(preview?.path ?? '');
        setWorktreeHash(preview?.hash ?? '');
      })
      .catch(() => {
        if (cancelled) return;
        setWorktreePath('');
        setWorktreeHash('');
      })
      .finally(() => {
        if (!cancelled) setWorktreePreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!pr) return null;

  function handleAction(fn) {
    setMode(null);
    fn();
  }

  return (
    <div class="pr-prompt-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="pr-prompt-window">
        <div class="pr-prompt-header">
          <span class="pr-prompt-title">PR #{pr.number}</span>
          <button type="button" class="pr-prompt-close" onClick={onClose}>×</button>
        </div>
        <div class="pr-prompt-body">
          <div class="pr-prompt-desc">
            <strong>{pr.title}</strong>
            <div class="pr-prompt-meta">by {pr.author} → {pr.baseBranch}</div>
          </div>

          {mode === null && (
            <div class="pr-prompt-actions">
              <button type="button" class="pr-prompt-btn pr-prompt-btn-primary" onClick={() => handleAction(onViewDiff)}>
                View diff
              </button>
              <button type="button" class="pr-prompt-btn" onClick={() => setMode('local')}>
                Checkout locally
              </button>
              <button type="button" class="pr-prompt-btn" onClick={() => setMode('worktree')}>
                Checkout in worktree
              </button>
            </div>
          )}

          {mode === 'local' && (
            <div class="pr-prompt-confirm">
              <p>This will switch your current branch to the PR branch.</p>
              <div class="pr-prompt-actions">
                <button type="button" class="pr-prompt-btn pr-prompt-btn-primary" onClick={() => handleAction(onCheckoutLocal)}>
                  Confirm checkout
                </button>
                <button type="button" class="pr-prompt-btn" onClick={() => setMode(null)}>
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === 'worktree' && (
            <div class="pr-prompt-confirm">
              <p>
                {worktreePreviewLoading
                  ? 'Preparing worktree path…'
                  : worktreePath
                    ? <>This will create a new worktree at <code>{worktreePath}</code> without changing your current branch.</>
                    : 'Could not determine worktree path.'}
              </p>
              <div class="pr-prompt-actions">
                <button
                  type="button"
                  class="pr-prompt-btn pr-prompt-btn-primary"
                  onClick={() => handleAction(() => onCheckoutWorktree(worktreeHash))}
                  disabled={worktreePreviewLoading || !worktreeHash}
                >
                  Confirm worktree
                </button>
                <button type="button" class="pr-prompt-btn" onClick={() => setMode(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .pr-prompt-overlay {
          position: fixed;
          inset: 0;
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
        }
        .pr-prompt-window {
          width: 420px;
          max-width: 90vw;
          background: var(--surface-raised);
          border-radius: 10px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .pr-prompt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          flex-shrink: 0;
        }
        .pr-prompt-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-h);
          font-family: var(--font-sans);
        }
        .pr-prompt-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .pr-prompt-close:hover {
          background: var(--accent-hover);
          color: var(--text);
        }
        .pr-prompt-body {
          padding: 0 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .pr-prompt-desc {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pr-prompt-desc strong {
          font-size: 13px;
          color: var(--text);
          font-weight: 500;
        }
        .pr-prompt-meta {
          font-size: 12px;
          color: var(--text-muted);
        }
        .pr-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pr-prompt-btn {
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: var(--accent-bg);
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pr-prompt-btn:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .pr-prompt-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .pr-prompt-btn-primary {
          background: var(--accent-bg);
          color: var(--text-h);
          font-weight: 500;
        }
        .pr-prompt-confirm p {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0 0 8px;
        }
        .pr-prompt-confirm code {
          font-family: var(--font-mono);
          font-size: 11px;
          background: var(--accent-bg);
          padding: 1px 4px;
          border-radius: 3px;
          color: var(--text-h);
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
