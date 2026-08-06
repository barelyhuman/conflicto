import { IconCheck, IconX, IconExternalLink, IconRefresh } from '@tabler/icons-preact';

/**
 * @param {Object} props
 * @param {{ installed: boolean, version: string, user: string }} props.ghStatus
 * @param {() => void} props.onRefresh
 */
export function GHSettings({ ghStatus = {}, onRefresh }) {
  const isInstalled = ghStatus.installed ?? false;
  const isLoggedIn = !!(ghStatus.user);
  const version = ghStatus.version ?? '';
  const user = ghStatus.user ?? '';

  return (
    <div class="gh-settings">
      <h2 class="gh-heading">GitHub</h2>

      <section class="gh-section">
        <h3 class="gh-section-title">CLI Status</h3>

        {isInstalled ? (
          <div class="gh-status-box gh-status-ok">
            <IconCheck size={18} class="gh-status-icon" />
            <div class="gh-status-info">
              <div class="gh-status-label">gh v{version} detected</div>
              {isLoggedIn && (
                <div class="gh-status-detail">Logged in as {user}</div>
              )}
            </div>
            <button type="button" class="gh-action-btn" onClick={onRefresh} title="Refresh status">
              <IconRefresh size={14} />
            </button>
          </div>
        ) : (
          <div class="gh-status-box gh-status-error">
            <IconX size={18} class="gh-status-icon" />
            <div class="gh-status-info">
              <div class="gh-status-label">gh CLI not found</div>
              <div class="gh-status-detail">
                Install the GitHub CLI to enable pull, push, and PR features.
              </div>
            </div>
          </div>
        )}

        {!isInstalled && (
          <a
            href="https://cli.github.com"
            target="_blank"
            rel="noopener noreferrer"
            class="gh-install-link"
          >
            Install gh CLI
            <IconExternalLink size={12} />
          </a>
        )}
      </section>

      {!isInstalled && (
        <section class="gh-section">
          <h3 class="gh-section-title">Manual Setup</h3>
          <p class="gh-hint">
            After installing, run <code>gh auth login</code> in your terminal
            and then restart conflicto.
          </p>
        </section>
      )}

      <style>{`
        .gh-settings {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .gh-heading {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 500;
          color: var(--text-h);
          margin: 0;
        }
        .gh-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gh-section-title {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin: 0;
        }
        .gh-status-box {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          background: var(--accent-bg);
        }
        .gh-status-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .gh-status-ok .gh-status-icon {
          color: var(--added);
        }
        .gh-status-error .gh-status-icon {
          color: var(--removed);
        }
        .gh-status-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .gh-status-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
        }
        .gh-status-detail {
          font-size: 12px;
          color: var(--text-muted);
        }
        .gh-action-btn {
          padding: 4px 10px;
          border-radius: 5px;
          border: none;
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .gh-action-danger {
          background: transparent;
          color: var(--removed);
        }
        .gh-action-danger:hover {
          background: var(--removed-bg);
        }
        .gh-install-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          align-self: flex-start;
          padding: 6px 12px;
          border-radius: 6px;
          background: var(--accent-bg);
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 12px;
          text-decoration: none;
          transition: background 0.15s;
        }
        .gh-install-link:hover {
          background: var(--accent-hover);
        }
        .gh-hint {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
        }
        .gh-hint code {
          font-family: var(--font-mono);
          font-size: 11px;
          background: var(--accent-bg);
          padding: 1px 4px;
          border-radius: 3px;
          color: var(--text-h);
        }
      `}</style>
    </div>
  );
}
