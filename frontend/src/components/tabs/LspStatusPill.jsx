import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { lspSession, notice } from '../../lsp/index.js';
import { describeEntry } from '../../lsp/session.js';
import { lspLanguageId } from '../../lsp/languageId.js';

/**
 * Language-server status for the open file: "gopls · indexing…", "ready",
 * or an honest "not installed — using text search" with the install hint.
 *
 * @param {{ path: string }} props
 */
export function LspStatusPill({ path }) {
  const languageId = lspLanguageId(path);
  const status = useComputed(() => {
    lspSession.servers.value;

    return languageId ? describeEntry(lspSession.entryFor(languageId)) : null;
  });
  const noticeText = useComputed(() => notice.value);

  return (
    <div class="lsp-pill-wrap">
      <Show when={noticeText}>
        <div class="lsp-pill tone-notice">{noticeText}</div>
      </Show>
      <Show when={status}>
        {(st) => (
          <div class={`lsp-pill tone-${st.tone}`} title={st.hint || st.text}>
            <span class="lsp-dot" aria-hidden="true" />
            <span class="lsp-pill-text">{st.text}</span>
            {st.tone === 'warn' && st.hint ? <code class="lsp-pill-hint">{st.hint}</code> : null}
            {st.restart ? (
              <button type="button" class="lsp-restart" onClick={() => lspSession.restart(st.id)}>
                Restart
              </button>
            ) : null}
          </div>
        )}
      </Show>
    </div>
  );
}
