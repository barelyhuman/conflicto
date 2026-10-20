import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconX } from '@tabler/icons-preact';
import { resultsPanel, closeResults } from '../../models/resultsPanel.js';
import { openResult } from '../../lsp/index.js';
import { ResultsList } from './ResultsList.jsx';
import './search.css';

/**
 * Bottom panel for find-references and ambiguous definitions. Same list
 * component as global search.
 */
export function ReferencesPanel() {
  const items = useComputed(() => resultsPanel.value?.items ?? []);
  const title = useComputed(() => {
    const p = resultsPanel.value;

    return p ? `${p.title} (${p.items.length})` : '';
  });
  const empty = useComputed(() => (resultsPanel.value?.items.length ?? 0) === 0);

  return (
    <Show when={resultsPanel}>
      <div
        class="refs-panel"
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeResults();
        }}
      >
        <div class="refs-header">
          <span class="refs-title">{title}</span>
          <button type="button" class="refs-close" title="Close" aria-label="Close" onClick={closeResults}>
            <IconX size={14} stroke={1.75} />
          </button>
        </div>
        <div class="refs-body">
          <Show when={empty} fallback={<ResultsList items={items} onOpen={openResult} />}>
            <div class="search-summary">No results</div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
