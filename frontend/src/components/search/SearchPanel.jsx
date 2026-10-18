import { useRef } from 'preact/hooks';
import { useComputed, useSignalEffect } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { ResultsList } from './ResultsList.jsx';
import './search.css';

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** Segmented "Changes | Search" switch above the sidebar body. */
export function SidebarViewSwitch({ model }) {
  const changesCls = useComputed(() => (model.mode.value === 'changes' ? 'active' : ''));
  const searchCls = useComputed(() => (model.mode.value === 'search' ? 'active' : ''));

  return (
    <div class="sidebar-view-switch" role="tablist">
      <button type="button" role="tab" class={changesCls} onClick={() => model.showChanges()}>
        Changes
      </button>
      <button
        type="button"
        role="tab"
        class={searchCls}
        title={isMac ? 'Search (⇧⌘F)' : 'Search (Ctrl+Shift+F)'}
        onClick={() => model.open()}
      >
        Search
      </button>
    </div>
  );
}

function Toggle({ label, title, on, onToggle }) {
  const cls = useComputed(() => `search-toggle${on.value ? ' on' : ''}`);

  return (
    <button type="button" class={cls} title={title} aria-pressed={on} onClick={onToggle}>
      {label}
    </button>
  );
}

/**
 * Global search view. Debounced as you type; Enter runs immediately and
 * ⌥⌘C / ⌥⌘W / ⌥⌘R toggle case, whole word and regex (Alt+C/W/R elsewhere).
 *
 * @param {{ model: ReturnType<typeof import('../../models/searchModel.js').createSearchModel> }} props
 */
export function SearchPanel({ model }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));

  useSignalEffect(() => {
    model.focusTick.value;
    input.current?.focus();
    input.current?.select();
  });

  const summary = useComputed(() => {
    const list = model.results.value;
    const status = model.status.value;
    const capped = model.capped.value;
    const n = list.length;

    if (status === 'searching' && n === 0) return 'Searching…';

    if (status !== 'done') return '';

    if (n === 0) return 'No results';
    const files = new Set(list.map((r) => r.path)).size;

    return `${n}${capped ? '+' : ''} result${n === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`;
  });
  const hasResults = useComputed(() => model.results.value.length > 0);
  const hasError = useComputed(() => model.status.value === 'error');

  function onKeyDown(e) {
    const chord = isMac ? e.metaKey && e.altKey : e.altKey && !e.ctrlKey && !e.metaKey;

    if (chord) {
      const which = { KeyC: 'case', KeyW: 'word', KeyR: 'regex' }[e.code];

      if (which) {
        e.preventDefault();
        e.stopPropagation();
        model.toggle(which);

        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      model.runNow();
    } else if (e.key === 'Escape') {
      e.currentTarget.blur?.();
    }
  }

  return (
    <div class="search-panel" onKeyDown={onKeyDown}>
      <div class="search-inputs">
        <div class="search-field">
          <input
            ref={input}
            type="text"
            class="search-input"
            placeholder="Search"
            spellcheck={false}
            autocomplete="off"
            value={model.query}
            onInput={(e) => {
              model.query.value = e.currentTarget.value;
              model.schedule();
            }}
          />
          <Toggle
            label="Aa"
            title={`Match case (${isMac ? '⌥⌘C' : 'Alt+C'})`}
            on={model.caseSensitive}
            onToggle={() => model.toggle('case')}
          />
          <Toggle
            label="ab"
            title={`Whole word (${isMac ? '⌥⌘W' : 'Alt+W'})`}
            on={model.wholeWord}
            onToggle={() => model.toggle('word')}
          />
          <Toggle
            label=".*"
            title={`Regex (${isMac ? '⌥⌘R' : 'Alt+R'})`}
            on={model.regex}
            onToggle={() => model.toggle('regex')}
          />
        </div>
        <input
          type="text"
          class="search-input search-glob"
          placeholder="files to include (e.g. *.go, src/**)"
          spellcheck={false}
          autocomplete="off"
          value={model.glob}
          onInput={(e) => {
            model.glob.value = e.currentTarget.value;
            model.schedule();
          }}
        />
      </div>

      <div class="search-summary" aria-live="polite">
        {summary}
        <Show when={model.capped}>
          <span class="search-capped"> · results capped</span>
        </Show>
      </div>

      <Show when={hasError}>
        <div class="search-error">{model.error}</div>
      </Show>

      <div class="search-results">
        <Show when={hasResults}>
          <ResultsList
            items={model.results}
            spec={model.spec}
            onOpen={(item) => model.openResult(item)}
          />
        </Show>
      </div>
    </div>
  );
}
