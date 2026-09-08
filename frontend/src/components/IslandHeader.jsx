import { Show } from '@preact/signals/utils';
import { SidebarToggle } from './SidebarToggle.jsx';
import { DiffExpandToggle } from './DiffExpandToggle.jsx';
import { CopyPathButton } from './CopyPathButton.jsx';
import { ViewModeToggle } from './ViewModeToggle.jsx';
import { PRPicker } from './PRPicker.jsx';
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
 * @param {number|null} props.selectedPR
 * @param {{ number: number, title: string, author: string, baseBranch: string }|null} props.currentPR
 * @param {(pr: { number: number, title: string, author: string, baseBranch: string } | null) => void} props.onSelectPR
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {() => void} props.onCreatePR
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
  selectedPR,
  currentPR,
  onSelectPR,
  onError,
  onCreatePR,
}) {
  const fullDiff = typeof showFullDiff === 'boolean' ? showFullDiff : showFullDiff.value;
  const editable = typeof canEdit === 'boolean' ? canEdit : canEdit.value;
  const mode = viewMode?.value ?? 'diff';
  return (
    <div class="island-header">
      <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />

      <Show
        when={activeFile}
        fallback={<div class="island-header-spacer" />}
      >
        {(path) => {
          const { name, dir } = splitPath(path);
          const fullPath = absoluteFilePath(projectPath, path);
          return (
            <div class="island-header-file" title={fullPath}>
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
