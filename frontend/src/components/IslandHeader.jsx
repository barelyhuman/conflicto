import { Show } from '@preact/signals/utils';
import { SidebarToggle } from './SidebarToggle.jsx';
import { DiffExpandToggle } from './DiffExpandToggle.jsx';
import { PRPicker } from './PRPicker.jsx';
import { splitPath } from './ChangeTree.jsx';

/**
 * Shared content-island header: sidebar toggle, file path, PR controls.
 *
 * @param {Object} props
 * @param {boolean} props.sidebarOpen
 * @param {() => void} props.onToggleSidebar
 * @param {import('@preact/signals-core').Signal<string|null>} props.activeFile
 * @param {boolean} props.isPRMode
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.showFullDiff
 * @param {() => void} props.onToggleShowFullDiff
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
  isPRMode,
  showFullDiff,
  onToggleShowFullDiff,
  selectedPR,
  currentPR,
  onSelectPR,
  onError,
  onCreatePR,
}) {
  const fullDiff = typeof showFullDiff === 'boolean' ? showFullDiff : showFullDiff.value;
  return (
    <div class="island-header">
      <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />

      <Show
        when={activeFile}
        fallback={<div class="island-header-spacer" />}
      >
        {(path) => {
          const { name, dir } = splitPath(path);
          return (
            <div class="island-header-file" title={path}>
              <span class="island-header-filename">{name}</span>
              {dir !== './' && <span class="island-header-dir">{dir}</span>}
              {!isPRMode ? (
                <DiffExpandToggle
                  expanded={fullDiff}
                  onToggle={onToggleShowFullDiff}
                />
              ) : null}
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
