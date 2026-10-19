import { useEffect, useRef } from 'preact/hooks';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { For, Show } from '@preact/signals/utils';
import { IconSearch } from '@tabler/icons-preact';
import { getPlatform } from '../../wails.js';
import { filterEntries } from './fuzzy.js';
import { WorkspaceRow } from './WorkspaceRow.jsx';
import { OPEN_PALETTE_EVENT } from './openPalette.js';
import './palette.css';

const MAX_RESULTS = 100;

const HOME_ENTRY = {
  kind: 'home', id: 'home:', title: 'Home', subtitle: 'Browse all repos, PRs and worktrees',
  prState: '', hasWorktree: false, stale: false, active: false,
};

/** Home is offered for an empty query, or one that is part of the word "home". */
function matchesHome(query) {
  const q = query.trim().toLowerCase();

  return q === '' || 'home'.includes(q);
}

function PaletteDialog({ index, onClose, onHome }) {
  const query = useSignal('');
  const selected = useSignal(0);
  const inputRef = useRef(null);
  const results = useComputed(() =>
    [
      ...(onHome && matchesHome(query.value) ? [{ entry: HOME_ENTRY, score: 0, indices: [] }] : []),
      ...filterEntries(index.entries.value, query.value, MAX_RESULTS),
    ].map((r, pos) => ({ ...r, pos }))
  );
  const count = useComputed(() => results.value.length);
  const empty = useComputed(() => results.value.length === 0);
  const activeDesc = useComputed(() => (count.value ? `palette-opt-${selected.value}` : undefined));

  useEffect(() => {
    inputRef.current?.focus();
    index.refresh();
  }, [index]);

  // Reset selection whenever the query changes.
  useSignalEffect(() => {
    query.value;
    selected.value = 0;
  });

  // Keep the selected row visible.
  useSignalEffect(() => {
    const el = document.getElementById(`palette-opt-${selected.value}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  });

  async function pick(entry) {
    if (!entry) return;

    if (entry.kind === 'home') {
      onClose();
      onHome();

      return;
    }

    if (await index.open(entry.id)) onClose();
  }

  function move(delta) {
    const n = count.peek();

    if (!n) return;
    selected.value = (selected.peek() + delta + n) % n;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results.peek()[selected.peek()]?.entry);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  return (
    <div
      class="palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-input-row">
          <IconSearch size={16} stroke={1.5} />
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={activeDesc}
            aria-autocomplete="list"
            placeholder="Search repos, PRs and worktrees"
            spellcheck={false}
            autocomplete="off"
            value={query}
            onInput={(e) => { query.value = e.currentTarget.value; }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div id="palette-listbox" class="palette-list" role="listbox" aria-label="Workspaces">
          <For each={results}>
            {(item) => (
              <WorkspaceRow
                key={item.entry.id}
                item={item}
                selected={selected}
                opening={index.opening}
                onPick={pick}
                onHover={(pos) => { selected.value = pos; }}
              />
            )}
          </For>
          <Show when={empty}>
            <div class="palette-empty">No matches</div>
          </Show>
        </div>
      </div>
    </div>
  );
}

/**
 * Global Cmd/Ctrl+K palette over the workspace index.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../../models/workspaceIndex.js').WorkspaceIndexModel>} props.index
 * @param {() => void} [props.onHome] shows the home screen; enables the "Home" result
 */
export function CommandPalette({ index, onHome }) {
  const open = useSignal(false);
  const isMac = useRef(typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? ''));

  useEffect(() => {
    let cancelled = false;
    getPlatform()
      .then((p) => {
        if (!cancelled && p !== 'unknown') isMac.current = p === 'darwin';
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // Capture phase so xterm (and anything else) cannot swallow the shortcut.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'k' && e.key !== 'K') return;

      if (e.altKey || e.shiftKey) return;
      const mod = isMac.current ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

      if (!mod) return;
      e.preventDefault();
      e.stopPropagation();
      open.value = !open.peek();
    }

    document.addEventListener('keydown', onKey, true);

    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Header buttons open the palette through a window event (see openPalette.js).
  useEffect(() => {
    const show = () => { open.value = true; };
    window.addEventListener(OPEN_PALETTE_EVENT, show);

    return () => window.removeEventListener(OPEN_PALETTE_EVENT, show);
  }, [open]);

  return (
    <Show when={open}>
      {() => <PaletteDialog index={index} onHome={onHome} onClose={() => { open.value = false; }} />}
    </Show>
  );
}
