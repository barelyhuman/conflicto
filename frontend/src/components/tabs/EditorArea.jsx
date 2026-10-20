import { useCallback } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { DiffViewer } from '../DiffViewer.jsx';
import { ConflictViewer } from '../ConflictViewer.jsx';
import { ConfirmDialog } from '../ConfirmDialog.jsx';
import { openFileAt } from '../../models/navigation.js';
import { PRView } from '../pr/PRView.jsx';
import { CompareView } from '../compare/CompareView.jsx';
import { ReferencesPanel } from '../search/ReferencesPanel.jsx';
import { FileTabEditor } from './FileTabEditor.jsx';
import { useTabShortcuts } from './useTabShortcuts.js';

const FILE_PREFIX = 'file:';
const SEP = '\u0000';

/**
 * Content area under the tab strip: diff tabs render the shared DiffViewer /
 * ConflictViewer (driven by the selection model, which follows the active
 * diff tab); file tabs render an editable CodeMirror view.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../../models/tabs.js').TabsModel>} props.tabs
 * @param {InstanceType<typeof import('../../models/selection.js').SelectionModel>} props.selection
 * @param {boolean} props.isMac
 * @param {(title: string, message: string) => void} [props.onError]
 */
export function EditorArea({ tabs, selection, isMac, onError }) {
  useTabShortcuts(tabs, isMac);

  // Primitive-valued computeds: Show only re-renders when the target changes,
  // not when a tab is pinned or marked dirty.
  const fileTabId = useComputed(() => {
    const tab = tabs.activeTab.value;
    const scope = tabs.scope.value ?? '';

    // Scope is part of the key: same path in two worktrees is two editors.
    return tab?.kind === 'file' ? `${scope}${SEP}${tab.id}` : null;
  });
  // Scope is part of the key: moving a PR tab into a worktree remounts the view
  // (the PR model itself is re-keyed and survives).
  const prTarget = useComputed(() => {
    const tab = tabs.activeTab.value;
    const scope = tabs.scope.value ?? '';

    return tab?.kind === 'pr' ? `${scope}${SEP}${tab.number}` : null;
  });
  const compareTarget = useComputed(() => {
    const tab = tabs.activeTab.value;
    const scope = tabs.scope.value ?? '';

    return tab?.kind === 'compare' ? `${scope}${SEP}${tab.id}` : null;
  });
  const hasDiffTab = useComputed(() => tabs.activeKind.value === 'diff');
  const isConflict = useComputed(() => selection.isConflict.value);
  const canOpenInEditor = useComputed(() => {
    const tab = tabs.activeTab.value;

    return tab?.kind === 'diff' && (tab.mode === 'working' || tab.mode === 'staged');
  });

  const openLineInEditor = useCallback(
    (line) => {
      const tab = tabs.activeTab.peek();

      if (tab?.kind === 'diff') openFileAt(tab.path, line);
    },
    [tabs]
  );

  const pendingClose = useComputed(() => {
    const id = tabs.pendingClose.value;
    const list = tabs.tabs.value;

    return id ? (list.find((t) => t.id === id)?.path ?? id) : null;
  });

  return (
    <>
      <Show
        when={compareTarget}
        fallback={
      <Show
        when={prTarget}
        fallback={
      <Show
        when={fileTabId}
        fallback={
          <Show
            when={hasDiffTab}
            fallback={<div class="diff-empty">Select a file to view changes</div>}
          >
            <Show
              when={isConflict}
              fallback={
                <DiffViewer
                  activeDiff={selection.activeDiff}
                  loading={selection.diffLoading}
                  isUnstaged={selection.isUnstaged}
                  showFullDiff={selection.showFullDiff}
                  canOpenInEditor={canOpenInEditor}
                  onOpenLineInEditor={openLineInEditor}
                />
              }
            >
              <ConflictViewer file={selection.activeFile} />
            </Show>
          </Show>
        }
      >
        {(target) => {
          const cut = target.indexOf(SEP);
          const scope = target.slice(0, cut) || null;
          const id = target.slice(cut + 1);

          return (
            <FileTabEditor
              key={target}
              tabId={id}
              path={id.slice(FILE_PREFIX.length)}
              scope={scope}
              onError={onError}
            />
          );
        }}
      </Show>
        }
      >
        {(target) => {
          const cut = target.indexOf(SEP);

          return (
            <PRView
              key={target}
              tabs={tabs}
              scope={target.slice(0, cut) || null}
              number={Number(target.slice(cut + 1))}
            />
          );
        }}
      </Show>
        }
      >
        {(target) => {
          const cut = target.indexOf(SEP);
          const scope = target.slice(0, cut) || null;
          const id = target.slice(cut + 1);
          const tab = tabs.tabs.peek().find((t) => t.id === id);

          return tab ? <CompareView key={target} tabs={tabs} tab={tab} scope={scope} /> : null;
        }}
      </Show>

      <ReferencesPanel />
      <PendingCloseDialog tabs={tabs} path={pendingClose} />
    </>
  );
}

/** Reuses ConfirmDialog; `path` is the signal of the dirty tab's file path. */
function PendingCloseDialog({ tabs, path }) {
  return (
    <Show when={path}>
      {(p) => (
        <ConfirmDialog
          open
          filename={p}
          title="Discard unsaved changes?"
          message={
            <>
              <code>{p}</code> has unsaved changes. Closing it will discard them.
            </>
          }
          confirmLabel="Discard"
          onConfirm={() => tabs.confirmPendingClose()}
          onCancel={() => tabs.cancelPendingClose()}
        />
      )}
    </Show>
  );
}
