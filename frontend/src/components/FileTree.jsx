import { useState, useCallback } from 'preact/hooks';
import { IconChevronRight } from '@tabler/icons-preact';
import { ChangeTree } from './ChangeTree.jsx';

/**
 * @typedef {'conflict' | 'staged' | 'unstaged' | 'pr'} FileSection
 */

/**
 * Sidebar file list: PR mode is a single tree; otherwise Conflicts / Staged / Unstaged sections.
 *
 * @param {Object} props
 * @param {{ path: string, status: string }[]} props.conflicts
 * @param {{ path: string, status: string }[]} props.staged
 * @param {{ path: string, status: string }[]} props.unstaged
 * @param {{ path: string, status: string }[]} props.prFiles
 * @param {boolean} props.isPRMode
 * @param {string|null} props.activeFile
 * @param {FileSection|null} props.activeSection
 * @param {(path: string, section: FileSection) => void} props.onSelect
 * @param {(path: string) => void} [props.onStage]
 * @param {(path: string) => void} [props.onUnstage]
 * @param {(path: string) => void} [props.onDiscard]
 * @param {() => void} [props.onStageAll]
 * @param {() => void} [props.onUnstageAll]
 */
export function FileTree({
  conflicts,
  staged,
  unstaged,
  prFiles,
  isPRMode,
  activeFile,
  activeSection,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
}) {
  const [conflictsOpen, setConflictsOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);

  const selectConflict = useCallback((path) => onSelect?.(path, 'conflict'), [onSelect]);
  const selectStaged = useCallback((path) => onSelect?.(path, 'staged'), [onSelect]);
  const selectUnstaged = useCallback((path) => onSelect?.(path, 'unstaged'), [onSelect]);
  const selectPR = useCallback((path) => onSelect?.(path, 'pr'), [onSelect]);

  if (isPRMode) {
    return (
      <div class="file-tree-sidebar">
        <ChangeTree
          files={prFiles}
          activeFile={activeSection === 'pr' ? activeFile : null}
          onSelect={selectPR}
        />
      </div>
    );
  }

  return (
    <div class="file-tree-sidebar">
      {conflicts.length > 0 && (
        <ChangeSection
          title="Conflicts"
          count={conflicts.length}
          open={conflictsOpen}
          onToggle={() => setConflictsOpen((v) => !v)}
        >
          <ChangeTree
            files={conflicts}
            activeFile={activeSection === 'conflict' ? activeFile : null}
            onSelect={selectConflict}
            flat
            showStage
            onStage={onStage}
          />
        </ChangeSection>
      )}

      <ChangeSection
        title="Staged Changes"
        count={staged.length}
        open={stagedOpen}
        onToggle={() => setStagedOpen((v) => !v)}
        actionLabel={staged.length > 0 ? 'Unstage All' : null}
        onAction={onUnstageAll}
      >
        {staged.length > 0 ? (
          <ChangeTree
            files={staged}
            activeFile={activeSection === 'staged' ? activeFile : null}
            onSelect={selectStaged}
            flat
            showUnstage
            onUnstage={onUnstage}
          />
        ) : (
          <div class="change-section-empty">No staged changes</div>
        )}
      </ChangeSection>

      <ChangeSection
        title="Changes"
        count={unstaged.length}
        open={unstagedOpen}
        onToggle={() => setUnstagedOpen((v) => !v)}
        actionLabel={unstaged.length > 0 ? 'Stage All' : null}
        onAction={onStageAll}
      >
        {unstaged.length > 0 ? (
          <ChangeTree
            files={unstaged}
            activeFile={activeSection === 'unstaged' ? activeFile : null}
            onSelect={selectUnstaged}
            flat
            showStage
            showDiscard
            onStage={onStage}
            onDiscard={onDiscard}
          />
        ) : (
          <div class="change-section-empty">No changes</div>
        )}
      </ChangeSection>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {number} props.count
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {string|null} [props.actionLabel]
 * @param {() => void} [props.onAction]
 * @param {import('preact').ComponentChildren} props.children
 */
function ChangeSection({ title, count, open, onToggle, actionLabel = null, onAction, children }) {
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
          <span class="change-section-count">{count}</span>
        </button>
        {actionLabel && (
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
        )}
      </div>
      {open && <div class="change-section-body">{children}</div>}
    </section>
  );
}
