import { useEffect, useRef } from 'preact/hooks';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { For, Show } from '@preact/signals/utils';
import { IconLoader2, IconSearch } from '@tabler/icons-preact';
import { api, getPlatform } from '../../wails.js';
import { openCompare, openPR } from '../../models/navigation.js';
import { tabsStore } from '../../models/tabs.js';
import { filterEntries } from './fuzzy.js';
import {
  PR_STATES,
  activeRepo,
  cachedPREntries,
  isCancellation,
  mergePRItems,
  nextPRState,
  parsePaletteInput,
  parsePRQuery,
  prEntryFromSummary,
  prSearchKey,
} from './prBrowser.js';
import { filterRefItems } from './refBrowser.js';
import { BROWSE_ACTION, COMPARE_ACTION, HOME_ACTION, paletteItems } from './actions.js';
import { WorkspaceRow } from './WorkspaceRow.jsx';
import { OPEN_PALETTE_EVENT } from './openPalette.js';
import './palette.css';

const MAX_RESULTS = 100;
const PR_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 200;

const STATE_LABELS = { open: 'Open', merged: 'Merged', closed: 'Closed', all: 'All' };

/** One segment of the PR state filter. `current` is the state signal; the option only re-renders on its own change. */
function StateButton({ state, current, onPick }) {
  const on = useComputed(() => current.value === state);
  const cls = useComputed(() => (on.value ? 'palette-seg-opt on' : 'palette-seg-opt'));
  const checked = useComputed(() => (on.value ? 'true' : 'false'));

  return (
    <button
      type="button"
      role="radio"
      tabIndex={-1}
      class={cls}
      aria-checked={checked}
      onClick={() => onPick(state)}
    >
      {STATE_LABELS[state]}
    </button>
  );
}

function PaletteDialog({ index, onClose, onHome, isMac }) {
  const query = useSignal('');
  /** 'index' searches the workspace list, 'prs' searches pull requests, 'refs' picks a compare ref. */
  const mode = useSignal(/** @type {'index' | 'prs' | 'refs'} */ ('index'));
  const prMode = useComputed(() => mode.value === 'prs');
  const refMode = useComputed(() => mode.value === 'refs');
  const refs = useSignal(/** @type {any[]} */ ([]));
  const refsLoading = useSignal(false);
  const refsError = useSignal('');
  const prState = useSignal('open');
  const selected = useSignal(0);
  /** Id of the row whose PR is being opened ('' when idle). */
  const busyId = useSignal('');
  const actionError = useSignal('');
  /** Latest live `searchPRs` answer, tagged with the key of the input it answered. */
  const liveResult = useSignal({ key: '', rows: [], error: '' });
  const liveLoading = useSignal(false);
  const inputRef = useRef(null);
  const searchSeq = useRef(0);

  const repo = useComputed(() => activeRepo(index.entries.value));
  const chipText = useComputed(() => {
    const name = repo.value.repoName;
    const label = refMode.value ? 'Diff' : 'PRs';

    return name ? `${label} · ${name}` : label;
  });
  const chipShown = useComputed(() => prMode.value || refMode.value);
  const parsed = useComputed(() => parsePRQuery(query.value));
  const liveKey = useComputed(() => prSearchKey(prState.value, query.value));

  // Cached open PRs of the active repo, fuzzy-filtered like everything else.
  const cachedItems = useComputed(() => {
    if (!prMode.value) return [];

    return filterEntries(
      cachedPREntries(index.entries.value, repo.value.repoPath, prState.value),
      parsed.value.text,
      MAX_RESULTS,
    );
  });

  const liveItems = useComputed(() => {
    if (!prMode.value) return [];
    const live = liveResult.value;

    if (live.key !== liveKey.value) return [];

    return live.rows.map((pr) => ({
      entry: prEntryFromSummary(pr, repo.value.repoPath), score: 0, indices: [],
    }));
  });

  const prItems = useComputed(() => mergePRItems(liveItems.value, cachedItems.value));

  const refItems = useComputed(() => (refMode.value ? filterRefItems(refs.value, query.value, MAX_RESULTS) : []));

  // Diffing needs an open project; Home needs a home screen to show.
  const actions = useComputed(() => [
    ...(onHome ? [HOME_ACTION] : []),
    BROWSE_ACTION,
    ...(repo.value.repoPath ? [COMPARE_ACTION] : []),
  ]);

  const normalItems = useComputed(() =>
    paletteItems(actions.value, index.entries.value, query.value, MAX_RESULTS)
  );

  const items = useComputed(() => {
    const list = refMode.value ? refItems.value : prMode.value ? prItems.value : normalItems.value;

    return list.map((r, pos) => ({ ...r, pos }));
  });
  const count = useComputed(() => items.value.length);
  const empty = useComputed(() => items.value.length === 0);
  const emptyText = useComputed(() => {
    if (refMode.value) return refsLoading.value ? 'Loading refs…' : 'No refs';

    return prMode.value ? 'No pull requests' : 'No matches';
  });
  const activeDesc = useComputed(() => (count.value ? `palette-opt-${selected.value}` : undefined));
  const placeholder = useComputed(() => {
    if (refMode.value) return 'Branch, tag, SHA or HEAD~n to diff the working tree against';

    return prMode.value ? 'Search pull requests by number, title or author' : 'Search repos, PRs and worktrees';
  });
  const opening = useComputed(() => busyId.value || index.opening.value);

  // Inline notice: an action error, or a failed live search (cached rows still shown).
  const notice = useComputed(() => {
    if (actionError.value) return actionError.value;
    if (refMode.value) return refsError.value ? `Could not list refs: ${refsError.value}` : '';
    if (!prMode.value) return '';
    const live = liveResult.value;

    if (live.key !== liveKey.value || !live.error) return '';

    return cachedItems.value.length
      ? 'gh not available: showing cached PRs'
      : `PR search failed: ${live.error}`;
  });

  const prFooter = isMac.current
    ? '↵ open · ⌘↵ open locally · ⌥⇥ state'
    : '↵ open · Ctrl+↵ open locally · Alt+Tab state';
  const refFooter = isMac.current
    ? '↵ diff with working tree · ⌘↵ from merge base'
    : '↵ diff with working tree · Ctrl+↵ from merge base';
  const footerText = useComputed(() => (refMode.value ? refFooter : prFooter));

  useEffect(() => {
    inputRef.current?.focus();
    index.refresh();
  }, [index]);

  // Reset selection whenever the query or the PR mode/state changes.
  useSignalEffect(() => {
    query.value;
    prMode.value;
    refMode.value;
    prState.value;
    selected.value = 0;
  });

  // Keep the selected row visible.
  useSignalEffect(() => {
    const el = document.getElementById(`palette-opt-${selected.value}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  });

  // Live `gh` search in PR mode, debounced. Superseded calls are ignored by sequence.
  useSignalEffect(() => {
    if (!prMode.value) {
      searchSeq.current += 1;
      liveLoading.value = false;

      return undefined;
    }

    const text = query.value;
    const state = prState.value;
    const key = prSearchKey(state, text);
    const seq = ++searchSeq.current;
    liveLoading.value = true;

    const timer = setTimeout(async () => {
      try {
        const rows = await api.searchPRs(parsePRQuery(text).text, state, PR_LIMIT);

        if (seq === searchSeq.current) liveResult.value = { key, rows: rows ?? [], error: '' };
      } catch (err) {
        if (seq === searchSeq.current && !isCancellation(err)) {
          liveResult.value = { key, rows: [], error: err?.message ?? String(err) };
        }
      } finally {
        if (seq === searchSeq.current) liveLoading.value = false;
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  });

  function enterPRMode() {
    mode.value = 'prs';
    query.value = '';

    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }

  function exitPRMode() {
    mode.value = 'index';
    query.value = '';
  }

  function resetInput() {
    query.value = '';

    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }

  async function enterRefMode() {
    mode.value = 'refs';
    resetInput();
    refsLoading.value = true;
    refsError.value = '';

    try {
      refs.value = (await api.listRefs()) ?? [];
    } catch (err) {
      refsError.value = err?.message ?? String(err);
    } finally {
      refsLoading.value = false;
    }
  }

  function exitRefMode() {
    mode.value = 'index';
    query.value = '';
  }

  /** Open a PR tab; `locally` also creates or links its worktree. Switches repo first when needed. */
  async function openPull(entry, locally) {
    if (busyId.peek()) return;
    busyId.value = entry.id;
    actionError.value = '';

    try {
      if (entry.repoPath && entry.repoPath !== repo.peek().repoPath) {
        await api.switchProject(entry.repoPath);
        // openPR targets the current tab scope; don't depend on projectChanged arriving first.
        const project = await api.getCurrentProject();
        if (project?.path) tabsStore.setScope(project.path);
      }

      const ok = await openPR(entry.prNumber, { locally });

      if (ok) onClose();
      else actionError.value = `Could not open PR #${entry.prNumber}`;
    } catch (err) {
      actionError.value = err?.message ?? String(err);
    } finally {
      busyId.value = '';
    }
  }

  async function pick(entry, locally = false) {
    if (!entry) return;

    if (entry.kind === 'home') {
      onClose();
      onHome();

      return;
    }

    if (entry.kind === 'browse') {
      enterPRMode();

      return;
    }

    if (entry.kind === 'pr') {
      await openPull(entry, locally);

      return;
    }

    if (entry.kind === 'compare') {
      enterRefMode();

      return;
    }

    if (entry.kind === 'ref') {
      if (openCompare(entry.ref, { mergeBase: locally })) onClose();
      else actionError.value = 'Open a project to diff against a ref';

      return;
    }

    if (await index.open(entry.id)) onClose();
  }

  function move(delta) {
    const n = count.peek();

    if (!n) return;
    selected.value = (selected.peek() + delta + n) % n;
  }

  function onInput(e) {
    const el = e.currentTarget;

    // A leading # switches to PR mode; the rest of the input becomes the PR query.
    if (mode.peek() === 'index' && el.value.startsWith('#')) {
      const parsedInput = parsePaletteInput(el.value);

      mode.value = parsedInput.mode;
      query.value = parsedInput.query;
      el.value = parsedInput.query;

      return;
    }

    query.value = el.value;
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
      const locally = isMac.current ? e.metaKey : e.ctrlKey;

      pick(items.peek()[selected.peek()]?.entry, locally);
    } else if (e.key === 'Tab' && e.altKey && prMode.peek()) {
      e.preventDefault();
      prState.value = nextPRState(prState.peek());
    } else if (e.key === 'Backspace' && prMode.peek() && query.peek() === '') {
      e.preventDefault();
      exitPRMode();
    } else if (e.key === 'Backspace' && refMode.peek() && query.peek() === '') {
      e.preventDefault();
      exitRefMode();
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
          <Show when={chipShown}>{() => <span class="palette-chip">{chipText}</span>}</Show>
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={activeDesc}
            aria-autocomplete="list"
            placeholder={placeholder}
            spellcheck={false}
            autocomplete="off"
            value={query}
            onInput={onInput}
            onKeyDown={onKeyDown}
          />
        </div>
        <Show when={prMode}>
          {() => (
            <div class="palette-pr-bar">
              <div class="palette-seg" role="radiogroup" aria-label="PR state">
                {PR_STATES.map((s) => (
                  <StateButton
                    key={s}
                    state={s}
                    current={prState}
                    onPick={(v) => {
                      prState.value = v;
                      inputRef.current?.focus();
                    }}
                  />
                ))}
              </div>
              <Show when={liveLoading}>
                {() => (
                  <span class="palette-spinner" role="status" aria-label="Searching">
                    <IconLoader2 size={14} stroke={1.5} />
                  </span>
                )}
              </Show>
            </div>
          )}
        </Show>
        <Show when={notice}>{(msg) => <div class="palette-notice" role="status">{msg}</div>}</Show>
        <div id="palette-listbox" class="palette-list" role="listbox" aria-label="Workspaces">
          <For each={items}>
            {(item) => (
              <WorkspaceRow
                key={item.entry.id}
                item={item}
                selected={selected}
                opening={opening}
                onPick={pick}
                onHover={(pos) => { selected.value = pos; }}
              />
            )}
          </For>
          <Show when={empty}>
            <div class="palette-empty">{emptyText}</div>
          </Show>
        </div>
        <Show when={chipShown}>{() => <div class="palette-footer">{footerText}</div>}</Show>
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
      {() => (
        <PaletteDialog
          index={index}
          isMac={isMac}
          onHome={onHome}
          onClose={() => { open.value = false; }}
        />
      )}
    </Show>
  );
}
