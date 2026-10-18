import { useState, useCallback, useMemo } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import {
  IconSquarePlus,
  IconSquareMinus,
  IconArrowBackUp,
} from '@tabler/icons-preact';
import { ChangeTree } from './ChangeTree.jsx';
import { CommitPanel } from './CommitPanel.jsx';
import { ChangeSection } from './ChangeSection.jsx';
import { highlightedPath } from '../models/tabsSelection.js';

/**
 * Sidebar file list: PR mode is a single tree; otherwise Conflicts / Staged / Unstaged sections.
 * Each section collapses independently and scrolls in its own body.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../models/workingTree.js').WorkingTreeModel>} props.workingTree
 * @param {import('@preact/signals-core').ReadonlySignal<import('../models/tabs.js').Tab|null>} props.activeTab
 * @param {(path: string, section: string, opts?: { pin?: boolean }) => void} props.onOpenDiff
 * @param {(path: string) => void} [props.onEditFile] open the file in an editor tab
 * @param {{ path: string, status: string }[]} props.prFiles
 * @param {boolean} props.isPRMode
 * @param {string} [props.currentBranch]
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 * @param {() => void} [props.onStageAll]
 * @param {() => void} [props.onUnstageAll]
 * @param {() => void} [props.onDiscardAll]
 * @param {(message: string) => void | Promise<void>} [props.onCommit]
 */
export function FileTree({
  workingTree,
  activeTab,
  onOpenDiff,
  onEditFile,
  prFiles,
  isPRMode,
  currentBranch = 'main',
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  onCommit,
}) {
  const [conflictsOpen, setConflictsOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);

  // Single click opens a preview diff tab; double click (detail >= 2) pins it.
  const openIn = useCallback(
    (section) => (path, opts) => onOpenDiff(path, section, opts),
    [onOpenDiff]
  );
  const selectConflict = useMemo(() => openIn('conflict'), [openIn]);
  const selectStaged = useMemo(() => openIn('staged'), [openIn]);
  const selectUnstaged = useMemo(() => openIn('unstaged'), [openIn]);
  const selectPR = useMemo(() => openIn('pr'), [openIn]);

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
                activeTab={activeTab}
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
                activeTab={activeTab}
                onEdit={onEditFile}
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
                activeTab={activeTab}
                onEdit={onEditFile}
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
          actions={[
            {
              title: 'Stage All',
              icon: <IconSquarePlus size={13} stroke={2} />,
              show: hasUnstaged,
              onClick: onStageAll,
            },
            {
              title: 'Revert All',
              icon: <IconArrowBackUp size={13} stroke={2} />,
              show: hasUnstaged,
              onClick: onDiscardAll,
            },
          ]}
        >
          <Show
            when={hasUnstaged}
            fallback={<div class="change-section-empty">No changes</div>}
          >
            {() => (
              <SignalChangeTree
                filesSignal={workingTree.unstaged}
                activeTab={activeTab}
                onEdit={onEditFile}
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
  activeTab,
  section,
  onSelect,
  onEdit,
  flat,
  showStage,
  showUnstage,
  showDiscard,
  onStage,
  onUnstage,
  onDiscard,
}) {
  const list = filesSignal ? filesSignal.value : files;

  const activeFile = highlightedPath(activeTab.value, section);

  return (
    <ChangeTree
      files={list}
      activeFile={activeFile}
      onSelect={onSelect}
      onEdit={onEdit}
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
