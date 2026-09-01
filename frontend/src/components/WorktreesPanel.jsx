import { useState } from 'preact/hooks';
import { IconChevronRight, IconTrash } from '@tabler/icons-preact';

/**
 * Shorten a filesystem path for display.
 * @param {string} path
 * @returns {string}
 */
function shortenPath(path) {
  if (!path) return '';
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join('/')}`;
}

/**
 * Sidebar panel listing git worktrees for the current repository.
 *
 * @param {Object} props
 * @param {Array<{ path: string, branch: string, head: string, isMain: boolean, isCurrent: boolean }>} props.worktrees
 * @param {string} props.currentPath
 * @param {(path: string) => void} props.onSwitch
 * @param {(path: string) => void} props.onRemove
 */
export function WorktreesPanel({ worktrees, currentPath, onSwitch, onRemove }) {
  const [open, setOpen] = useState(true);

  const linkedCount = worktrees.filter((wt) => !wt.isMain).length;

  return (
    <div class="worktrees-panel">
      <section class={`change-section${open ? ' change-section-open' : ' change-section-collapsed'}`}>
        <div class="sg-header change-section-header">
          <button
            type="button"
            class="change-section-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span class={`change-section-chevron${open ? ' open' : ''}`} aria-hidden="true">
              <IconChevronRight size={12} stroke={1.75} />
            </span>
            <span class="sg-title change-section-title">Worktrees</span>
          </button>
          <div class="sg-actions change-section-actions">
            <span class="sg-count change-section-count">{linkedCount}</span>
          </div>
        </div>

        {open && (
          <div class="change-section-body">
            {worktrees.length === 0 ? (
              <div class="change-section-empty">No worktrees</div>
            ) : (
              <ul class="worktrees-list">
                {worktrees.map((wt) => {
                  const label = wt.branch || wt.head || 'detached';
                  const isActive = wt.path === currentPath || wt.isCurrent;

                  return (
                    <li key={wt.path} class={`worktree-row${isActive ? ' active' : ''}`}>
                      <button
                        type="button"
                        class="worktree-row-btn"
                        onClick={() => onSwitch?.(wt.path)}
                        title={wt.path}
                      >
                        <span class="worktree-row-label">
                          {label}
                          {wt.isMain && <span class="worktree-badge">main</span>}
                          {isActive && !wt.isMain && <span class="worktree-badge">active</span>}
                        </span>
                        <span class="worktree-row-path">{shortenPath(wt.path)}</span>
                      </button>
                      {!wt.isMain && (
                        <button
                          type="button"
                          class="worktree-remove-btn"
                          title="Remove worktree"
                          aria-label={`Remove worktree at ${wt.path}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove?.(wt.path);
                          }}
                        >
                          <IconTrash size={12} stroke={1.75} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <style>{`
        .worktrees-panel {
          flex-shrink: 0;
        }
        .worktrees-panel .change-section-open {
          flex: 0 0 auto;
        }
        .worktrees-panel .change-section-body {
          max-height: 160px;
          overflow-y: auto;
        }
        .worktrees-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .worktree-row {
          display: flex;
          align-items: stretch;
          border-radius: 6px;
        }
        .worktree-row:hover {
          background: var(--accent-bg);
        }
        .worktree-row.active {
          background: var(--accent-hover);
        }
        .worktree-row-btn {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          padding: 6px 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-family: var(--font-sans);
        }
        .worktree-row-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-h);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .worktree-row-path {
          font-size: 10px;
          color: var(--text-muted);
          font-family: var(--font-mono);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .worktree-badge {
          flex-shrink: 0;
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 1px 4px;
          border-radius: 3px;
          background: var(--accent-bg);
          color: var(--text-muted);
        }
        .worktree-row.active .worktree-badge {
          background: var(--surface-raised);
        }
        .worktree-remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          flex-shrink: 0;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0;
          border-radius: 4px;
          transition: opacity 0.15s, background 0.15s, color 0.15s;
        }
        .worktree-row:hover .worktree-remove-btn {
          opacity: 1;
        }
        .worktree-remove-btn:hover {
          background: var(--accent-hover);
          color: var(--text-h);
        }
      `}</style>
    </div>
  );
}
