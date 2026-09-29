import { useState, useRef, useEffect } from 'preact/hooks';
import { IconExternalLink } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';

/**
 * CI status dot + check list popover for the active PR.
 * Labels derive from the summary; open state is local UI only.
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

  const view = checksView(summary);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class={`pr-checks-trigger status-${view.status}`}
        onClick={() => setOpen((v) => !v)}
        title={view.title}
        aria-label={view.title}
      >
        <span class="pr-checks-dot" aria-hidden="true" />
        <span class="pr-checks-label">{view.short}</span>
      </button>

      <AnchoredMenu
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        className="pr-checks-menu"
      >
        <div class="pr-checks-panel">
          <div class="pr-checks-panel-title">CI checks</div>
          {view.body === 'error' ? (
            <p class="pr-checks-error">{summary.error}</p>
          ) : view.body === 'empty' ? (
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
    </>
  );
}

/** Derive trigger/panel presentation from a summary payload. */
function checksView(summary) {
  if (summary?.error) {
    return {
      status: 'error',
      title: `CI status unavailable: ${summary.error}`,
      short: 'CI ?',
      body: 'error',
    };
  }
  if (!summary) {
    return { status: 'none', title: 'Loading CI status…', short: 'CI …', body: 'empty' };
  }
  switch (summary.status) {
    case 'running':
      return {
        status: 'running',
        title: `${summary.pending ?? 0} CI check(s) running`,
        short: `${summary.pending ?? 0} running`,
        body: 'list',
      };
    case 'success':
      return {
        status: 'success',
        title: 'All CI checks passed',
        short: 'passed',
        body: 'list',
      };
    case 'failure':
      return {
        status: 'failure',
        title: `${summary.fail ?? 0} CI check(s) failed`,
        short: `${summary.fail ?? 0} failed`,
        body: 'list',
      };
    case 'none':
      return { status: 'none', title: 'No CI checks', short: 'no checks', body: 'empty' };
    default:
      return { status: 'none', title: 'Loading CI status…', short: 'CI', body: 'empty' };
  }
}
