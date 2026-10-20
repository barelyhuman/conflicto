import { Signal } from '@preact/signals';
import { IconHome } from '@tabler/icons-preact';
import { Show } from '@preact/signals/utils';
import { SidebarToggle } from './SidebarToggle.jsx';
import { DiffExpandToggle } from './DiffExpandToggle.jsx';
import { CopyPathButton } from './CopyPathButton.jsx';
import { IconPencil } from '@tabler/icons-preact';
import { TabStrip } from './tabs/TabStrip.jsx';
import { openFileAt } from '../models/navigation.js';
import { openPalette } from './palette/openPalette.js';

function absoluteFilePath(projectRoot, relativePath) {
  if (!projectRoot) return relativePath;
  const base = projectRoot.replace(/\/$/, '');

  return `${base}/${relativePath}`;
}

/**
 * Shared content-island header: sidebar toggle, editor tab strip, create-PR and PR browser buttons.
 *
 * @param {Object} props
 * @param {boolean} props.sidebarOpen
 * @param {() => void} props.onToggleSidebar
 * @param {InstanceType<typeof import('../models/tabs.js').TabsModel>} props.tabs
 * @param {string} props.projectPath
 * @param {import('@preact/signals-core').ReadonlySignal<boolean>|boolean} props.showFullDiff
 * @param {() => void} props.onToggleShowFullDiff
 * @param {() => void} props.onCreatePR
 * @param {() => void} [props.onShowHome]
 */
export function IslandHeader({
  sidebarOpen,
  onToggleSidebar,
  tabs,
  projectPath,
  showFullDiff,
  onToggleShowFullDiff,
  onCreatePR,
  onShowHome,
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
          // PR tabs carry their own header; there is no file path to act on.
          if (tab.kind === 'pr') return null;
          const fullPath = absoluteFilePath(projectPath, tab.path);

          return (
            <div class="island-header-tools">
              {tab.kind === 'diff' ? (
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
              {tab.kind === 'diff' ? (
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
        <button
          type="button"
          class="create-pr-trigger"
          onClick={onCreatePR}
          title="Create PR"
        >
          +PR
        </button>
        <button
          type="button"
          class="pr-browse-trigger"
          onClick={openPalette}
          title="Find pull requests, worktrees and repos (⌘K)"
        >
          PRs
        </button>
      </div>
    </div>
  );
}
