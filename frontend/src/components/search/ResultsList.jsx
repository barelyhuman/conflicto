import { useComputed } from '@preact/signals';
import { For } from '@preact/signals/utils';
import { groupByFile, splitPreview } from '../../models/searchModel.js';

function fileName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function dirName(path) {
  const i = path.lastIndexOf('/');

  return i < 0 ? '' : path.slice(0, i);
}

/**
 * Matches grouped by file with the hit highlighted. Shared by global search
 * and the references / definition-candidates panel.
 *
 * @param {Object} props
 * @param {import('@preact/signals').ReadonlySignal<import('../../models/searchModel.js').ResultItem[]>} props.items
 * @param {import('@preact/signals').ReadonlySignal<any> | null} [props.spec] query options for highlighting items without `len`
 * @param {(item: import('../../models/searchModel.js').ResultItem) => void} props.onOpen
 */
export function ResultsList({ items, spec = null, onOpen }) {
  const groups = useComputed(() => {
    const sp = spec?.value;

    return groupByFile(items.value).map((g) => ({
      path: g.path,
      name: fileName(g.path),
      dir: dirName(g.path),
      rows: g.items.map((item) => ({ item, ...splitPreview(item, sp) })),
    }));
  });

  return (
    <div class="results-list" role="list">
      <For each={groups}>
        {(g) => (
          <div class="result-group" role="listitem" key={g.path}>
            <div class="result-file" title={g.path}>
              <span class="result-file-name">{g.name}</span>
              <span class="result-file-dir">{g.dir}</span>
              <span class="result-file-count">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => (
              <button
                type="button"
                class="result-row"
                key={`${r.item.line}:${r.item.col}`}
                onClick={() => onOpen(r.item)}
              >
                <span class="result-line">{r.item.line}</span>
                <span class="result-text">
                  {r.pre}
                  {r.hit ? <mark>{r.hit}</mark> : null}
                  {r.post}
                </span>
              </button>
            ))}
          </div>
        )}
      </For>
    </div>
  );
}
