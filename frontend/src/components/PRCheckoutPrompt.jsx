import { useComputed, useModel } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconRefresh } from '@tabler/icons-preact';
import { PRCheckoutPromptModel } from '../models/prCheckoutPrompt.js';

/**
 * Prompt shown when a PR is selected offering checkout options.
 * @param {Object} props
 * @param {{ number: number, title: string, author: string, baseBranch: string } | null} props.pr
 * @param {null | 'local' | 'worktree'} [props.checkoutPending]
 * @param {() => void} props.onViewDiff
 * @param {() => void} props.onCheckoutLocal
 * @param {(hash: string) => void} props.onCheckoutWorktree
 * @param {() => void} props.onClose
 */
export function PRCheckoutPrompt({
  pr,
  checkoutPending = null,
  onViewDiff,
  onCheckoutLocal,
  onCheckoutWorktree,
  onClose,
}) {
  const model = useModel(PRCheckoutPromptModel);
  const isBusy = checkoutPending != null;

  const loadingTitle = checkoutPending === 'worktree'
    ? 'Creating worktree…'
    : 'Checking out PR…';

  const worktreeConfirmDisabled = useComputed(
    () => model.worktreePreviewLoading.value || !model.worktreeHash.value
  );

  if (!pr) return null;

  function handleViewDiff() {
    model.resetMode();
    onViewDiff();
  }

  function handleOverlayClick(e) {
    if (isBusy) return;
    if (e.target === e.currentTarget) onClose();
  }

  function handleClose() {
    if (isBusy) return;
    onClose();
  }

  return (
    <div class="pr-prompt-overlay" onClick={handleOverlayClick}>
      <div
        class="pr-prompt-window"
        aria-busy={isBusy}
        aria-live="polite"
      >
        <div class="pr-prompt-header">
          <span class="pr-prompt-title">PR #{pr.number}</span>
          <button
            type="button"
            class="pr-prompt-close"
            onClick={handleClose}
            disabled={isBusy}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div class="pr-prompt-body">
          <div class="pr-prompt-desc">
            <strong>{pr.title}</strong>
            <div class="pr-prompt-meta">by {pr.author} → {pr.baseBranch}</div>
          </div>

          {isBusy ? (
            <div class="pr-prompt-loading">
              <IconRefresh size={18} stroke={2} class="spin" aria-hidden="true" />
              <span class="pr-prompt-loading-title">{loadingTitle}</span>
              <Show when={() => checkoutPending === 'worktree' && model.worktreePath.value}>
                {(path) => <code class="pr-prompt-loading-path">{path}</code>}
              </Show>
            </div>
          ) : (
            <Show
              when={() => model.mode.value === null}
              fallback={(
                <Show
                  when={() => model.mode.value === 'local'}
                  fallback={(
                    <div class="pr-prompt-confirm">
                      <p>
                        <Show when={model.worktreePreviewLoading} fallback={(
                          <Show
                            when={model.worktreePath}
                            fallback="Could not determine worktree path."
                          >
                            {(path) => (
                              <>
                                This will create a new worktree at <code>{path}</code> without changing your current branch.
                              </>
                            )}
                          </Show>
                        )}
                        >
                          Preparing worktree path…
                        </Show>
                      </p>
                      <div class="pr-prompt-actions">
                        <button
                          type="button"
                          class="pr-prompt-btn pr-prompt-btn-primary"
                          onClick={() => onCheckoutWorktree(model.worktreeHash.peek())}
                          disabled={worktreeConfirmDisabled}
                        >
                          Confirm worktree
                        </button>
                        <button type="button" class="pr-prompt-btn" onClick={() => model.resetMode()}>
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                >
                  <div class="pr-prompt-confirm">
                    <p>This will switch your current branch to the PR branch.</p>
                    <div class="pr-prompt-actions">
                      <button type="button" class="pr-prompt-btn pr-prompt-btn-primary" onClick={onCheckoutLocal}>
                        Confirm checkout
                      </button>
                      <button type="button" class="pr-prompt-btn" onClick={() => model.resetMode()}>
                        Back
                      </button>
                    </div>
                  </div>
                </Show>
              )}
            >
              <div class="pr-prompt-actions">
                <button type="button" class="pr-prompt-btn pr-prompt-btn-primary" onClick={handleViewDiff}>
                  View diff
                </button>
                <button type="button" class="pr-prompt-btn" onClick={() => model.setMode('local')}>
                  Checkout locally
                </button>
                <button type="button" class="pr-prompt-btn" onClick={() => model.setMode('worktree')}>
                  Checkout in worktree
                </button>
              </div>
            </Show>
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
        .pr-prompt-close:hover:not(:disabled) {
          background: var(--accent-hover);
          color: var(--text);
        }
        .pr-prompt-close:disabled {
          opacity: 0.4;
          cursor: not-allowed;
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
        .pr-prompt-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 12px 0 4px;
          text-align: center;
        }
        .pr-prompt-loading-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-h);
          font-family: var(--font-sans);
        }
        .pr-prompt-loading-path {
          font-family: var(--font-mono);
          font-size: 11px;
          background: var(--accent-bg);
          padding: 4px 8px;
          border-radius: 4px;
          color: var(--text-muted);
          word-break: break-all;
          max-width: 100%;
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
