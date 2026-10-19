import { useComputed } from '@preact/signals';
import { Show, useLiveSignal } from '@preact/signals/utils';
import {
  IconFolder,
  IconGitBranch,
  IconGitPullRequest,
  IconHome,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-preact';
import { Highlighted } from '../Highlighted.jsx';
import './palette.css';

export { Highlighted };

function KindIcon({ kind }) {
  if (kind === 'pr' || kind === 'browse') return <IconGitPullRequest size={16} stroke={1.5} />;

  if (kind === 'worktree') return <IconGitBranch size={16} stroke={1.5} />;

  if (kind === 'home') return <IconHome size={16} stroke={1.5} />;

  return <IconFolder size={16} stroke={1.5} />;
}

/**
 * One workspace-index row, shared by the palette and the home screen.
 *
 * @param {Object} props
 * @param {{ entry: object, indices: number[], pos: number }} props.item
 * @param {import('@preact/signals-core').ReadonlySignal<number>} props.selected selected position
 * @param {import('@preact/signals-core').ReadonlySignal<string>} props.opening id being opened
 * @param {(entry: object) => void} props.onPick
 * @param {(pos: number) => void} props.onHover
 * @param {string} [props.idPrefix] DOM id prefix (`<prefix>-<pos>`)
 * @param {(entry: object) => void} [props.onRemove] shows a "Remove worktree" action on stale rows
 */
export function WorkspaceRow({ item, selected, opening, onPick, onHover, idPrefix = 'palette-opt', onRemove }) {
  const { entry, indices, pos } = item;
  // Rows are keyed by entry id, so the same instance survives re-ranking: keep item live.
  const live = useLiveSignal(item);
  const isSel = useComputed(() => selected.value === live.value.pos);
  const className = useComputed(
    () => `palette-row${isSel.value ? ' selected' : ''}${live.value.entry.stale ? ' stale' : ''}`
  );
  const isSelected = useComputed(() => (isSel.value ? 'true' : 'false'));
  const pending = useComputed(() => opening.value === live.value.entry.id);
  const hasWt = entry.kind === 'worktree' || entry.hasWorktree;
  const showHint = useComputed(() => {
    const e = live.value.entry;
    const sel = isSel.value;
    const busy = pending.value;
    return e.kind === 'pr' && sel && !busy;
  });

  return (
    <div
      id={`${idPrefix}-${pos}`}
      role="option"
      class={className}
      aria-selected={isSelected}
      onMouseMove={() => onHover(pos)}
      onClick={() => onPick(entry)}
    >
      <span class="palette-glyph"><KindIcon kind={entry.kind} /></span>
      <span class="palette-text">
        <span class="palette-title"><Highlighted text={entry.title} indices={indices} /></span>
        <Show when={() => Boolean(entry.subtitle)}>
          <span class="palette-sub">{entry.subtitle}</span>
        </Show>
      </span>
      <span class="palette-badges">
        <Show when={showHint}>
          <span class="palette-hint">Enter: open PR</span>
        </Show>
        <Show when={pending}>
          <span class="palette-spinner" role="status" aria-label="Opening">
            <IconLoader2 size={14} stroke={1.5} />
          </span>
        </Show>
        {hasWt && <span class="palette-badge">{entry.kind === 'pr' ? 'local' : 'worktree'}</span>}
        {entry.prState && entry.kind !== 'repo' && (
          <span class={`palette-badge pr-${entry.prState.toLowerCase()}`}>{entry.prState.toLowerCase()}</span>
        )}
        {entry.stale && <span class="palette-badge stale">stale</span>}
        {entry.active && <span class="palette-badge active">active</span>}
        {onRemove && entry.stale && entry.path && (
          <button
            type="button"
            class="palette-remove"
            title="Remove worktree"
            aria-label="Remove worktree"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(entry);
            }}
          >
            <IconTrash size={14} stroke={1.5} />
            <span>Remove worktree</span>
          </button>
        )}
      </span>
    </div>
  );
}
