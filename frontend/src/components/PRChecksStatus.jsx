import { useState, useRef, useEffect } from 'preact/hooks';
import { IconExternalLink } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';

/**
 * CI status dot + check list popover for the active PR.
 *
 * @param {Object} props
 * @param {boolean} props.active
 * @param {{ status?: string, pending?: number, pass?: number, fail?: number, total?: number, checks?: Array<{ name: string, bucket: string, workflow?: string, link?: string }>, error?: string }|null} props.summary
 */
export function PRChecksStatus({ active, summary }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  if (!active) return null;

  const status = summary?.error ? 'error' : (summary?.status ?? 'none');
  const label = statusLabel(summary);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class={`pr-checks-trigger status-${status}`}
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
      >
        <span class="pr-checks-dot" aria-hidden="true" />
        <span class="pr-checks-label">{shortLabel(summary)}</span>
      </button>

      <AnchoredMenu
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        className="pr-checks-menu"
      >
        <div class="pr-checks-panel">
          <div class="pr-checks-panel-title">CI checks</div>
          {summary?.error ? (
            <p class="pr-checks-error">{summary.error}</p>
          ) : (summary?.total ?? 0) === 0 ? (
            <p class="pr-checks-empty">No checks reported for this PR.</p>
          ) : (
            <>
              <div class="pr-checks-stats">
                <span class="stat-pending">{summary.pending ?? 0} pending</span>
                <span class="stat-pass">{summary.pass ?? 0} passed</span>
                <span class="stat-fail">{summary.fail ?? 0} failed</span>
              </div>
              <ul class="pr-checks-list">
                {(summary.checks ?? []).map((check) => (
                  <li key={`${check.workflow}-${check.name}`} class={`check-row bucket-${check.bucket || 'unknown'}`}>
                    <span class="check-name">{check.name}</span>
                    {check.workflow ? (
                      <span class="check-workflow">{check.workflow}</span>
                    ) : null}
                    {check.link ? (
                      <a
                        class="check-link"
                        href={check.link}
                        title="Open check run"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconExternalLink size={12} />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </AnchoredMenu>

      <style>{`
        .pr-checks-trigger {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .pr-checks-trigger:hover {
          background: var(--accent-bg);
          color: var(--text);
        }
        .pr-checks-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
          flex-shrink: 0;
        }
        .status-running .pr-checks-dot {
          background: #d4a017;
          box-shadow: 0 0 0 0 rgba(212, 160, 23, 0.5);
          animation: pr-checks-pulse 1.6s ease-out infinite;
        }
        .status-success .pr-checks-dot { background: #3d9a57; }
        .status-failure .pr-checks-dot { background: #c44; }
        .status-error .pr-checks-dot { background: #888; }
        @keyframes pr-checks-pulse {
          0% { box-shadow: 0 0 0 0 rgba(212, 160, 23, 0.45); }
          70% { box-shadow: 0 0 0 6px rgba(212, 160, 23, 0); }
          100% { box-shadow: 0 0 0 0 rgba(212, 160, 23, 0); }
        }
        .pr-checks-label {
          max-width: 72px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pr-checks-menu {
          min-width: 280px;
          max-width: 360px;
        }
        .pr-checks-panel {
          padding: 10px 12px 12px;
        }
        .pr-checks-panel-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-h);
          margin-bottom: 8px;
        }
        .pr-checks-stats {
          display: flex;
          gap: 10px;
          font-size: 11px;
          margin-bottom: 8px;
          color: var(--text-muted);
        }
        .stat-fail { color: #c44; }
        .stat-pass { color: #3d9a57; }
        .pr-checks-list {
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 220px;
          overflow-y: auto;
        }
        .check-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 6px;
          align-items: center;
          padding: 5px 0;
          border-top: 1px solid var(--border-subtle);
          font-size: 11px;
        }
        .check-row:first-child { border-top: none; }
        .check-name { color: var(--text); }
        .check-workflow {
          color: var(--text-muted);
          font-size: 10px;
        }
        .check-link {
          color: var(--text-muted);
          display: flex;
        }
        .check-link:hover { color: var(--text); }
        .bucket-fail .check-name { color: #c44; }
        .pr-checks-empty, .pr-checks-error {
          margin: 0;
          font-size: 11px;
          color: var(--text-muted);
        }
        .pr-checks-error { color: #c44; }
      `}</style>
    </>
  );
}

function statusLabel(summary) {
  if (summary?.error) return `CI status unavailable: ${summary.error}`;
  switch (summary?.status) {
    case 'running':
      return `${summary.pending ?? 0} CI check(s) running`;
    case 'success':
      return 'All CI checks passed';
    case 'failure':
      return `${summary.fail ?? 0} CI check(s) failed`;
    case 'none':
      return 'No CI checks';
    default:
      return 'Loading CI status…';
  }
}

function shortLabel(summary) {
  if (summary?.error) return 'CI ?';
  if (!summary) return 'CI …';
  switch (summary.status) {
    case 'running':
      return `${summary.pending ?? 0} running`;
    case 'success':
      return 'passed';
    case 'failure':
      return `${summary.fail ?? 0} failed`;
    case 'none':
      return 'no checks';
    default:
      return 'CI';
  }
}
