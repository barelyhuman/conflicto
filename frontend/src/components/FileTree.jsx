import { useState, useCallback } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconChevronRight } from '@tabler/icons-preact';
import { ChangeTree } from './ChangeTree.jsx';
import { CommitPanel } from './CommitPanel.jsx';

/**
 * @typedef {'conflict' | 'staged' | 'unstaged' | 'pr'} FileSection
 */

/**
 * Sidebar file list: PR mode is a single tree; otherwise Conflicts / Staged / Unstaged sections.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../models/workingTree.js').WorkingTreeModel>} props.workingTree
 * @param {InstanceType<typeof import('../models/selection.js').SelectionModel>} props.selection
 * @param {{ path: string, status: string }[]} props.prFiles
 * @param {boolean} props.isPRMode
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 * @param {() => void} [props.onStageAll]
 * @param {() => void} [props.onUnstageAll]
 * @param {(message: string) => void | Promise<void>} [props.onCommit]
 */
export function FileTree({
  workingTree,
  selection,
  prFiles,
  isPRMode,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onCommit,
}) {
  const [conflictsOpen, setConflictsOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);

  const selectConflict = useCallback(
    (path) => selection.select(path, 'conflict'),
    [selection]
  );
  const selectStaged = useCallback(
    (path) => selection.select(path, 'staged'),
    [selection]
  );
  const selectUnstaged = useCallback(
    (path) => selection.select(path, 'unstaged'),
    [selection]
  );
  const selectPR = useCallback(
    (path) => selection.select(path, 'pr'),
    [selection]
  );

  const hasConflicts = useComputed(() => workingTree.conflicts.value.length > 0);
  const conflictsCount = useComputed(() => workingTree.conflicts.value.length);
  const stagedCount = useComputed(() => workingTree.staged.value.length);
  const unstagedCount = useComputed(() => workingTree.unstaged.value.length);
  const hasStaged = useComputed(() => workingTree.staged.value.length > 0);
  const hasUnstaged = useComputed(() => workingTree.unstaged.value.length > 0);

  if (isPRMode) {
    return (
      <div class="file-tree-sidebar">
        <div class="file-tree-scroll">
          <SignalChangeTree
            filesSignal={null}
            files={prFiles}
            selection={selection}
            section="pr"
            onSelect={selectPR}
          />
        </div>
      </div>
    );
  }

  return (
    <div class="file-tree-sidebar">
      <div class="file-tree-scroll">
        <Show when={hasConflicts}>
          {() => (
            <ChangeSection
              title="Conflicts"
              countSignal={conflictsCount}
              open={conflictsOpen}
              onToggle={() => setConflictsOpen((v) => !v)}
            >
              <SignalChangeTree
                filesSignal={workingTree.conflicts}
                selection={selection}
                section="conflict"
                onSelect={selectConflict}
                flat
                showStage
                onStage={onStage}
              />
            </ChangeSection>
          )}
        </Show>

        <section class="change-section change-section-staged">
          <div class="change-section-header">
            <button
              type="button"
              class="change-section-toggle"
              onClick={() => setStagedOpen((v) => !v)}
              aria-expanded={stagedOpen}
            >
              <span class={`change-section-chevron${stagedOpen ? ' open' : ''}`} aria-hidden="true">
                <IconChevronRight size={12} stroke={1.75} />
              </span>
              <span class="change-section-title">Staged Changes</span>
              <span class="change-section-count">{stagedCount}</span>
            </button>
            <Show when={hasStaged}>
              <button
                type="button"
                class="change-section-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstageAll?.();
                }}
              >
                Unstage All
              </button>
            </Show>
          </div>

          <StagedCommitPanel stagedCount={stagedCount} onCommit={onCommit} />

          {stagedOpen && (
            <div class="change-section-body">
              <Show
                when={hasStaged}
                fallback={<div class="change-section-empty">No staged changes</div>}
              >
                {() => (
                  <SignalChangeTree
                    filesSignal={workingTree.staged}
                    selection={selection}
                    section="staged"
                    onSelect={selectStaged}
                    flat
                    showUnstage
                    onUnstage={onUnstage}
                  />
                )}
              </Show>
            </div>
          )}
        </section>

        <ChangeSection
          title="Changes"
          countSignal={unstagedCount}
          open={unstagedOpen}
          onToggle={() => setUnstagedOpen((v) => !v)}
          actionLabelSignal={hasUnstaged}
          actionLabel="Stage All"
          onAction={onStageAll}
        >
          <Show
            when={hasUnstaged}
            fallback={<div class="change-section-empty">No changes</div>}
          >
            {() => (
              <SignalChangeTree
                filesSignal={workingTree.unstaged}
                selection={selection}
                section="unstaged"
                onSelect={selectUnstaged}
                flat
                showStage
                showDiscard
                onStage={onStage}
                onDiscard={onDiscard}
              />
            )}
          </Show>
        </ChangeSection>
      </div>
    </div>
  );
}

/**
 * Unboxes file-list + selection signals so ChangeTree stays array-based.
 */
function SignalChangeTree({
  filesSignal,
  files,
  selection,
  section,
  onSelect,
  flat,
  showStage,
  showUnstage,
  showDiscard,
  onStage,
  onUnstage,
  onDiscard,
}) {
  const list = filesSignal ? filesSignal.value : files;
  const activeFile =
    selection.activeSection.value === section ? selection.activeFile.value : null;

  return (
    <ChangeTree
      files={list}
      activeFile={activeFile}
      onSelect={onSelect}
      flat={flat}
      showStage={showStage}
      showUnstage={showUnstage}
      showDiscard={showDiscard}
      onStage={onStage}
      onUnstage={onUnstage}
      onDiscard={onDiscard}
    />
  );
}

function StagedCommitPanel({ stagedCount, onCommit }) {
  return <CommitPanel stagedCount={stagedCount.value} onCommit={onCommit} />;
}

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {number} [props.count]
 * @param {import('@preact/signals-core').Signal<number>} [props.countSignal]
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {string|null} [props.actionLabel]
 * @param {import('@preact/signals-core').Signal<boolean>} [props.actionLabelSignal]
 * @param {() => void} [props.onAction]
 * @param {import('preact').ComponentChildren} props.children
 */
function ChangeSection({
  title,
  count,
  countSignal,
  open,
  onToggle,
  actionLabel = null,
  actionLabelSignal,
  onAction,
  children,
}) {
  return (
    <section class="change-section">
      <div class="change-section-header">
        <button
          type="button"
          class="change-section-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span class={`change-section-chevron${open ? ' open' : ''}`} aria-hidden="true">
            <IconChevronRight size={12} stroke={1.75} />
          </span>
          <span class="change-section-title">{title}</span>
          <span class="change-section-count">
            {countSignal != null ? countSignal : count}
          </span>
        </button>
        {actionLabelSignal != null ? (
          <Show when={actionLabelSignal}>
            <button
              type="button"
              class="change-section-action"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.();
              }}
            >
              {actionLabel}
            </button>
          </Show>
        ) : (
          actionLabel && (
            <button
              type="button"
              class="change-section-action"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.();
              }}
            >
              {actionLabel}
            </button>
          )
        )}
      </div>
      {open && <div class="change-section-body">{children}</div>}
    </section>
  );
}
