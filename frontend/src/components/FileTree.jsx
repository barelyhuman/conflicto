import { useCallback } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconSquarePlus, IconSquareMinus } from '@tabler/icons-preact';
import { ChangeTree } from './ChangeTree.jsx';
import { CommitPanel } from './CommitPanel.jsx';

/**
 * Sidebar file list: PR mode is a single tree; otherwise Conflicts / Staged / Unstaged sections.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../models/workingTree.js').WorkingTreeModel>} props.workingTree
 * @param {InstanceType<typeof import('../models/selection.js').SelectionModel>} props.selection
 * @param {{ path: string, status: string }[]} props.prFiles
 * @param {boolean} props.isPRMode
 * @param {string} [props.currentBranch]
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
  currentBranch = 'main',
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onCommit,
}) {
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
        <div class="file-list file-tree-scroll">
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
      <div class="file-list file-tree-scroll">
        <Show when={hasConflicts}>
          {() => (
            <>
              <SectionHeader
                title="Conflicts"
                countSignal={conflictsCount}
              />
              <SignalChangeTree
                filesSignal={workingTree.conflicts}
                selection={selection}
                section="conflict"
                onSelect={selectConflict}
                flat
                showStage
                onStage={onStage}
              />
              <div class="divider" />
            </>
          )}
        </Show>

        <SectionHeader
          title="Staged Changes"
          countSignal={stagedCount}
          actionTitle="Unstage All"
          actionIcon={<IconSquareMinus size={13} stroke={2} />}
          showAction={hasStaged}
          onAction={onUnstageAll}
        />
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

        <div class="divider" />

        <SectionHeader
          title="Changes"
          countSignal={unstagedCount}
          actionTitle="Stage All"
          actionIcon={<IconSquarePlus size={13} stroke={2} />}
          showAction={hasUnstaged}
          onAction={onStageAll}
        />
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
      </div>

      <CommitPanel
        stagedCount={stagedCount}
        currentBranch={currentBranch}
        onCommit={onCommit}
      />
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

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {import('@preact/signals-core').Signal<number>} props.countSignal
 * @param {string} [props.actionTitle]
 * @param {import('preact').ComponentChildren} [props.actionIcon]
 * @param {import('@preact/signals-core').Signal<boolean>|boolean} [props.showAction]
 * @param {() => void} [props.onAction]
 */
function SectionHeader({
  title,
  countSignal,
  actionTitle,
  actionIcon,
  showAction,
  onAction,
}) {
  return (
    <div class="sg-header change-section-header">
      <div class="sg-title change-section-title">{title}</div>
      <div class="sg-actions change-section-actions">
        {actionIcon && showAction != null && (
          typeof showAction === 'object' && 'value' in showAction ? (
            <Show when={showAction}>
              <button
                type="button"
                class="sg-icon-btn change-section-action"
                title={actionTitle}
                aria-label={actionTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.();
                }}
              >
                {actionIcon}
              </button>
            </Show>
          ) : showAction ? (
            <button
              type="button"
              class="sg-icon-btn change-section-action"
              title={actionTitle}
              aria-label={actionTitle}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.();
              }}
            >
              {actionIcon}
            </button>
          ) : null
        )}
        <span class="sg-count change-section-count">{countSignal}</span>
      </div>
    </div>
  );
}
