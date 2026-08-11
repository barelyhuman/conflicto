import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconGitBranch, IconArrowUp, IconArrowDown, IconRefresh } from '@tabler/icons-preact';
import { BranchPicker } from './BranchPicker.jsx';

/**
 * Sidebar actions row: branch pill + pull/push with presence badges.
 * PR controls live in the content island header.
 *
 * @param {Object} props
 * @param {string} props.currentBranch
 * @param {string[]} props.localBranches
 * @param {string[]} props.remoteBranches
 * @param {(branch: string) => void} props.onSelectBranch
 * @param {InstanceType<typeof import('../models/sync.js').SyncModel>} props.sync
 */
export function SidebarActions({
  currentBranch,
  localBranches,
  remoteBranches,
  onSelectBranch,
  sync,
}) {
  const canPull = useComputed(() => sync.behind.value > 0 && !sync.isPulling.value);
  const canPush = useComputed(() => sync.ahead.value > 0 && !sync.isPushing.value);

  const pullTitle = useComputed(() =>
    sync.isPulling.value
      ? 'Pulling…'
      : sync.behind.value > 0
        ? `Pull (${sync.behind.value})`
        : 'Pull'
  );

  const pushTitle = useComputed(() =>
    sync.isPushing.value
      ? 'Pushing…'
      : sync.ahead.value > 0
        ? `Push (${sync.ahead.value})`
        : 'Push'
  );

  const showPullBadge = useComputed(() => sync.behind.value > 0 && !sync.isPulling.value);
  const showPushBadge = useComputed(() => sync.ahead.value > 0 && !sync.isPushing.value);

  return (
    <div class="actions-row">
      <BranchPicker
        onSelect={onSelectBranch}
        currentBranch={currentBranch}
        localBranches={localBranches}
        remoteBranches={remoteBranches}
        compact
        pill
        icon={<IconGitBranch size={11} stroke={2} />}
      />
      <div class="actions-row-end">
        <div class="sync-actions">
          <button
            type="button"
            class="icon-btn"
            title={pullTitle}
            aria-label="Pull"
            aria-busy={sync.isPulling}
            onClick={() => sync.pull()}
            disabled={!canPull.value}
          >
            <Show when={sync.isPulling} fallback={<IconArrowDown size={13} stroke={2} />}>
              <IconRefresh size={13} stroke={2} class="spin" />
            </Show>
            <Show when={showPullBadge}>
              <span class="dot-badge" aria-hidden="true" />
            </Show>
          </button>
          <button
            type="button"
            class="icon-btn"
            title={pushTitle}
            aria-label="Push"
            aria-busy={sync.isPushing}
            onClick={() => sync.push()}
            disabled={!canPush.value}
          >
            <Show when={sync.isPushing} fallback={<IconArrowUp size={13} stroke={2} />}>
              <IconRefresh size={13} stroke={2} class="spin" />
            </Show>
            <Show when={showPushBadge}>
              <span class="dot-badge" aria-hidden="true" />
            </Show>
          </button>
        </div>
      </div>
    </div>
  );
}
