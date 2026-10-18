import { useEffect, useRef } from 'preact/hooks';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { For, Show } from '@preact/signals/utils';
import { IconFolder, IconGitBranch, IconGitPullRequest, IconLoader2, IconSearch } from '@tabler/icons-preact';
import { getPlatform } from '../../wails.js';
import { filterEntries } from './fuzzy.js';
import './palette.css';

const MAX_RESULTS = 100;

function KindIcon({ kind }) {
  if (kind === 'pr') return <IconGitPullRequest size={16} stroke={1.5} />;

  if (kind === 'worktree') return <IconGitBranch size={16} stroke={1.5} />;

  return <IconFolder size={16} stroke={1.5} />;
}

/** Split text into plain / highlighted runs from sorted char indices. */
function Highlighted({ text, indices }) {
  if (!indices.length) return text;
  const set = new Set(indices);
  const parts = [];
  let run = '';
  let runOn = false;

  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);

    if (on !== runOn && run) {
      parts.push(runOn ? <mark key={i}>{run}</mark> : run);
      run = '';
    }

    runOn = on;
    run += text[i];
  }

  if (run) parts.push(runOn ? <mark key="end">{run}</mark> : run);

  return parts;
}

function Row({ item, selected, opening, onPick, onHover }) {
  const { entry, indices, pos } = item;
  const className = useComputed(
    () => `palette-row${selected.value === pos ? ' selected' : ''}`
  );
  const isSelected = useComputed(() => (selected.value === pos ? 'true' : 'false'));
  const pending = useComputed(() => opening.value === entry.id);
  const isPR = entry.kind === 'pr';
  const hasWt = entry.kind === 'worktree' || entry.hasWorktree;
  const remoteOnly = isPR && !entry.hasWorktree;
  const showHint = useComputed(() => remoteOnly && selected.value === pos && !pending.value);

  return (
    <div
      id={`palette-opt-${pos}`}
      role="option"
      class={className}
      aria-selected={isSelected}
      onMouseMove={() => onHover(pos)}
      onClick={() => onPick(entry)}
    >
      <span class="palette-glyph"><KindIcon kind={entry.kind} /></span>
      <span class="palette-text">
        <span class="palette-title"><Highlighted text={entry.title} indices={indices} /></span>
        <Show when={() => Boolean(entry.subtitle)}>
          <span class="palette-sub">{entry.subtitle}</span>
        </Show>
      </span>
      <span class="palette-badges">
        <Show when={showHint}>
          <span class="palette-hint">Enter: create worktree</span>
        </Show>
        <Show when={pending}>
          <span class="palette-spinner" role="status" aria-label="Opening">
            <IconLoader2 size={14} stroke={1.5} />
          </span>
        </Show>
        {hasWt && <span class="palette-badge">worktree</span>}
        {isPR && entry.prState && (
          <span class={`palette-badge pr-${entry.prState.toLowerCase()}`}>{entry.prState.toLowerCase()}</span>
        )}
        {entry.stale && <span class="palette-badge stale">stale</span>}
        {entry.active && <span class="palette-badge active">active</span>}
      </span>
    </div>
  );
}

function PaletteDialog({ index, onClose }) {
  const query = useSignal('');
  const selected = useSignal(0);
  const inputRef = useRef(null);
  const results = useComputed(() =>
    filterEntries(index.entries.value, query.value, MAX_RESULTS).map((r, pos) => ({ ...r, pos }))
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
              <Row
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
 */
export function CommandPalette({ index }) {
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

  return (
    <Show when={open}>
      {() => <PaletteDialog index={index} onClose={() => { open.value = false; }} />}
    </Show>
  );
}
