import { Signal } from '@preact/signals';
import { IconHome } from '@tabler/icons-preact';
import { Show } from '@preact/signals/utils';
import { SidebarToggle } from './SidebarToggle.jsx';
import { DiffExpandToggle } from './DiffExpandToggle.jsx';
import { CopyPathButton } from './CopyPathButton.jsx';
import { ViewModeToggle } from './ViewModeToggle.jsx';
import { PRPicker } from './PRPicker.jsx';
import { PRChecksStatus } from './PRChecksStatus.jsx';
import { splitPath } from './ChangeTree.jsx';

function absoluteFilePath(projectRoot, relativePath) {
  if (!projectRoot) return relativePath;
  const base = projectRoot.replace(/\/$/, '');

  return `${base}/${relativePath}`;
}

/**
 * Shared content-island header: sidebar toggle, file path, PR controls.
 *
 * @param {Object} props
 * @param {boolean} props.sidebarOpen
 * @param {() => void} props.onToggleSidebar
 * @param {import('@preact/signals-core').Signal<string|null>} props.activeFile
 * @param {string} props.projectPath
 * @param {boolean} props.isPRMode
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.showFullDiff
 * @param {() => void} props.onToggleShowFullDiff
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.canEdit]
 * @param {import('@preact/signals-core').Signal<'diff' | 'edit'>} [props.viewMode]
 * @param {() => void} [props.onToggleViewMode]
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} [props.dirty]
 * @param {number|null} props.selectedPR
 * @param {{ number: number, title: string, author: string, baseBranch: string }|null} props.currentPR
 * @param {(pr: { number: number, title: string, author: string, baseBranch: string } | null) => void} props.onSelectPR
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {() => void} props.onCreatePR
 * @param {() => void} [props.onShowHome]
 * @param {boolean} [props.showCIMonitor]
 * @param {{ status?: string, pending?: number, pass?: number, fail?: number, total?: number, checks?: unknown[], error?: string }|null} [props.prChecksSummary]
 */
export function IslandHeader({
  sidebarOpen,
  onToggleSidebar,
  activeFile,
  projectPath,
  isPRMode,
  showFullDiff,
  onToggleShowFullDiff,
  canEdit = false,
  viewMode,
  onToggleViewMode,
  dirty = false,
  selectedPR,
  currentPR,
  onSelectPR,
  onError,
  onCreatePR,
  onShowHome,
  showCIMonitor = false,
  prChecksSummary = null,
}) {
  const fullDiff = showFullDiff instanceof Signal ? showFullDiff.value : showFullDiff;
  const editable = canEdit instanceof Signal ? canEdit.value : canEdit;
  const mode = viewMode?.value ?? 'diff';

  return (
    <div class="island-header">
      <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />
      {onShowHome && (
        <button
          type="button"
          class="sidebar-toggle"
          title="Home"
          aria-label="Home"
          onClick={onShowHome}
        >
          <IconHome size={16} stroke={1.75} />
        </button>
      )}

      <Show
        when={activeFile}
        fallback={<div class="island-header-spacer" />}
      >
        {(path) => {
          const { name, dir } = splitPath(path);
          const fullPath = absoluteFilePath(projectPath, path);

          return (
            <div class="island-header-file" title={fullPath}>
              <Show when={dirty}>
                <span
                  class="island-header-dirty"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              </Show>
              <span class="island-header-filename">{name}</span>
              {dir !== './' && <span class="island-header-dir">{dir}</span>}
              {!isPRMode && editable ? (
                <ViewModeToggle mode={mode} onToggle={onToggleViewMode} />
              ) : null}
              {!isPRMode ? (
                <DiffExpandToggle
                  expanded={fullDiff}
                  onToggle={onToggleShowFullDiff}
                />
              ) : null}
              <CopyPathButton absolutePath={fullPath} relativePath={path} />
            </div>
          );
        }}
      </Show>

      <div class="island-header-actions">
        <PRChecksStatus active={showCIMonitor} summary={prChecksSummary} />
        <button
          type="button"
          class="create-pr-trigger"
          onClick={onCreatePR}
          title="Create PR"
        >
          +PR
        </button>
        <PRPicker
          selectedPR={selectedPR}
          currentPR={currentPR}
          onSelect={onSelectPR}
          onError={onError}
        />
      </div>
    </div>
  );
}
