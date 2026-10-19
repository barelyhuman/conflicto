import { useCallback, useEffect, useMemo } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconRefresh } from '@tabler/icons-preact';
import { compareTabs } from '../../models/compareTab.js';
import { openCompare, openFileAt } from '../../models/navigation.js';
import { DiffViewer } from '../DiffViewer.jsx';
import { ChangeTree } from '../ChangeTree.jsx';
import { isTerminalFocusTarget } from '../terminal/TerminalDock.jsx';
import '../pr/pr.css';

/**
 * One compare tab: the active worktree's working tree diffed against a ref,
 * laid out like the PR files view (changed files left, diff right).
 *
 * @param {{
 *   tabs: InstanceType<typeof import('../../models/tabs.js').TabsModel>,
 *   tab: import('../../models/tabs.js').Tab,
 *   scope: string | null,
 * }} props
 */
export function CompareView({ tabs, tab, scope }) {
  const model = useMemo(() => compareTabs.get(scope, tab.ref, tab.mergeBase), [scope, tab.ref, tab.mergeBase]);

  useEffect(() => {
    model.ensureFresh();
  }, [model]);

  // Alt+Up / Alt+Down: previous / next file, as in the PR files view.
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const t = e.target;

      if (isTerminalFocusTarget(t)) return;

      if (t?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      e.preventDefault();
      model.stepFile(e.key === 'ArrowDown' ? 1 : -1);
    }

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [model]);

  /** Swap this tab for the same ref in the other mode (direct ↔ merge base). */
  function toggleMergeBase() {
    const id = tab.id;

    if (openCompare(tab.ref, { mergeBase: !tab.mergeBase })) tabs.close(id);
  }

  return (
    <div class="pr-view">
      <CompareHeader model={model} onToggleMergeBase={toggleMergeBase} />
      <CompareFiles model={model} />
    </div>
  );
}

function CompareHeader({ model, onToggleMergeBase }) {
  const shortBase = useComputed(() => model.baseSHA.value.slice(0, 8));
  const fileCount = useComputed(() => `${model.files.value.length} files`);
  const additions = useComputed(() => `+${model.totals.value.additions}`);
  const deletions = useComputed(() => `−${model.totals.value.deletions}`);
  const baseLabel = model.mergeBase ? `merge base of HEAD and ${model.ref}` : model.ref;

  return (
    <header class="pr-head">
      <div class="pr-title-row">
        <h1 class="pr-title">Working tree vs {model.ref}</h1>
      </div>
      <div class="pr-meta-row">
        <span class="pr-ref">
          {baseLabel}
          <Show when={shortBase}>{(sha) => <span class="pr-muted"> ({sha})</span>}</Show>
          {' '}<span aria-label="to">→</span> working tree
        </span>
        <span class="pr-diffstat">
          <span class="pr-add">{additions}</span> <span class="pr-del">{deletions}</span>
        </span>
        <span>{fileCount}</span>
        <span class="pr-spacer" />
        <button
          type="button"
          class="pr-icon-btn"
          title="Refresh"
          aria-label="Refresh comparison"
          onClick={() => model.refresh()}
        >
          <IconRefresh size={13} stroke={1.75} />
        </button>
        <button
          type="button"
          class="pr-btn"
          title={model.mergeBase ? `Diff directly against ${model.ref}` : `Diff from the merge base of HEAD and ${model.ref}`}
          onClick={onToggleMergeBase}
        >
          {model.mergeBase ? 'Compare directly' : 'From merge base'}
        </button>
      </div>
    </header>
  );
}

function CompareFiles({ model }) {
  const hasFiles = useComputed(() => model.files.value.length > 0);
  const emptyText = useComputed(() => (model.loading.value ? 'Loading files…' : 'No differences'));
  // Deleted files have no working-tree side to open.
  const canOpenInEditor = useComputed(() => {
    const f = model.files.value[model.selectedIndex.value];

    return Boolean(f) && f.status !== 'D';
  });
  const openLine = useCallback((line) => {
    const path = model.selectedPath.peek();

    if (path) openFileAt(path, line);
  }, [model]);
  const loadContents = useCallback((path) => model.loadContents(path), [model]);

  return (
    <div class="pr-files">
      <nav class="pr-files-list" aria-label="Changed files">
        <Show
          when={model.error}
          fallback={
            <Show when={hasFiles} fallback={<div class="pr-muted pr-pad">{emptyText}</div>}>
              <CompareFileTree model={model} />
            </Show>
          }
        >
          {(msg) => <div class="pr-error pr-pad">Could not compare: {msg}</div>}
        </Show>
      </nav>
      <div class="pr-files-diff">
        <Show
          when={model.patchError}
          fallback={
            <DiffViewer
              activeDiff={model.activeDiff}
              loading={model.diffLoading}
              canOpenInEditor={canOpenInEditor}
              onOpenLineInEditor={openLine}
              loadContents={loadContents}
            />
          }
        >
          {(msg) => <div class="pr-diff-message pr-error">Could not load this file's diff: {msg}</div>}
        </Show>
      </div>
    </div>
  );
}

/** Leaf bridge: ChangeTree is array-based, so unbox the file + selection signals here. */
function CompareFileTree({ model }) {
  const files = model.files.value;
  const active = model.selectedPath.value;

  return <ChangeTree files={files} activeFile={active} onSelect={(path) => model.selectFile(path)} />;
}
