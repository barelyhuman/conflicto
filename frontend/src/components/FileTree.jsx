import { useState, useCallback } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import {
  IconSquarePlus,
  IconSquareMinus,
} from '@tabler/icons-preact';
import { ChangeTree } from './ChangeTree.jsx';
import { CommitPanel } from './CommitPanel.jsx';
import { ChangeSection } from './ChangeSection.jsx';

/**
 * Sidebar file list: PR mode is a single tree; otherwise Conflicts / Staged / Unstaged sections.
 * Each section collapses independently and scrolls in its own body.
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
        <div class="file-sections">
          <div class="change-section change-section-open">
            <div class="change-section-body file-tree-scroll">
              <SignalChangeTree
                filesSignal={null}
                files={prFiles}
                selection={selection}
                section="pr"
                onSelect={selectPR}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="file-tree-sidebar">
      <div class="file-sections">
        <Show when={hasConflicts}>
          {() => (
            <ChangeSection
              title="Conflicts"
              count={conflictsCount}
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

        <ChangeSection
          title="Staged Changes"
          count={stagedCount}
          open={stagedOpen}
          onToggle={() => setStagedOpen((v) => !v)}
          actionTitle="Unstage All"
          actionIcon={<IconSquareMinus size={13} stroke={2} />}
          showAction={hasStaged}
          onAction={onUnstageAll}
        >
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
        </ChangeSection>

        <ChangeSection
          title="Changes"
          count={unstagedCount}
          open={unstagedOpen}
          onToggle={() => setUnstagedOpen((v) => !v)}
          actionTitle="Stage All"
          actionIcon={<IconSquarePlus size={13} stroke={2} />}
          showAction={hasUnstaged}
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
