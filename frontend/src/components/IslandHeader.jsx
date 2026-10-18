import { Signal } from '@preact/signals';
import { IconHome } from '@tabler/icons-preact';
import { Show } from '@preact/signals/utils';
import { SidebarToggle } from './SidebarToggle.jsx';
import { DiffExpandToggle } from './DiffExpandToggle.jsx';
import { CopyPathButton } from './CopyPathButton.jsx';
import { IconPencil } from '@tabler/icons-preact';
import { TabStrip } from './tabs/TabStrip.jsx';
import { openFileAt } from '../models/navigation.js';
import { PRPicker } from './PRPicker.jsx';
import { PRChecksStatus } from './PRChecksStatus.jsx';
import { ReviewBar } from './ReviewBar.jsx';

function absoluteFilePath(projectRoot, relativePath) {
  if (!projectRoot) return relativePath;
  const base = projectRoot.replace(/\/$/, '');

  return `${base}/${relativePath}`;
}

/**
 * Shared content-island header: sidebar toggle, editor tab strip, PR controls.
 *
 * @param {Object} props
 * @param {boolean} props.sidebarOpen
 * @param {() => void} props.onToggleSidebar
 * @param {InstanceType<typeof import('../models/tabs.js').TabsModel>} props.tabs
 * @param {string} props.projectPath
 * @param {boolean} props.isPRMode
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.showFullDiff
 * @param {() => void} props.onToggleShowFullDiff
 * @param {number|null} props.selectedPR
 * @param {{ number: number, title: string, author: string, baseBranch: string }|null} props.currentPR
 * @param {(pr: { number: number, title: string, author: string, baseBranch: string } | null) => void} props.onSelectPR
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {() => void} props.onCreatePR
 * @param {() => void} [props.onShowHome]
 * @param {boolean} [props.showCIMonitor]
 * @param {InstanceType<typeof import('../models/review.js').ReviewModel>} [props.review]
 * @param {{ status?: string, pending?: number, pass?: number, fail?: number, total?: number, checks?: unknown[], error?: string }|null} [props.prChecksSummary]
 */
export function IslandHeader({
  sidebarOpen,
  onToggleSidebar,
  tabs,
  projectPath,
  isPRMode,
  showFullDiff,
  onToggleShowFullDiff,
  selectedPR,
  currentPR,
  onSelectPR,
  onError,
  onCreatePR,
  onShowHome,
  showCIMonitor = false,
  prChecksSummary = null,
  review,
}) {
  const fullDiff = showFullDiff instanceof Signal ? showFullDiff.value : showFullDiff;

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

      <TabStrip tabs={tabs} />

      <Show when={tabs.activeTab}>
        {(tab) => {
          const fullPath = absoluteFilePath(projectPath, tab.path);

          return (
            <div class="island-header-tools">
              {tab.kind === 'diff' && tab.mode !== 'pr' ? (
                <button
                  type="button"
                  class="header-icon-btn"
                  title="Open file to edit"
                  aria-label="Open file to edit"
                  onClick={() => openFileAt(tab.path, 1)}
                >
                  <IconPencil size={13} stroke={1.75} />
                </button>
              ) : null}
              {tab.kind === 'diff' && !isPRMode ? (
                <DiffExpandToggle
                  expanded={fullDiff}
                  onToggle={onToggleShowFullDiff}
                />
              ) : null}
              <CopyPathButton absolutePath={fullPath} relativePath={tab.path} />
            </div>
          );
        }}
      </Show>

      <div class="island-header-actions">
        <PRChecksStatus active={showCIMonitor} summary={prChecksSummary} />
        {isPRMode && review ? <ReviewBar review={review} /> : null}
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
