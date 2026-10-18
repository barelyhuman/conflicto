import { useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import {
  IconFolder,
  IconGitBranch,
  IconGitPullRequest,
  IconHome,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-preact';
import './palette.css';

function KindIcon({ kind }) {
  if (kind === 'pr') return <IconGitPullRequest size={16} stroke={1.5} />;

  if (kind === 'worktree') return <IconGitBranch size={16} stroke={1.5} />;

  if (kind === 'home') return <IconHome size={16} stroke={1.5} />;

  return <IconFolder size={16} stroke={1.5} />;
}

/** Split text into plain / highlighted runs from sorted char indices. */
export function Highlighted({ text, indices }) {
  if (!indices.length) return text;
  const set = new Set(indices);
  const parts = [];
  let run = '';
  let runOn = false;

  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);

    if (on !== runOn && run) {
      parts.push(runOn ? <mark key={i}>{run}</mark> : run);
      run = '';
    }

    runOn = on;
    run += text[i];
  }

  if (run) parts.push(runOn ? <mark key="end">{run}</mark> : run);

  return parts;
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
  const className = useComputed(
    () => `palette-row${selected.value === pos ? ' selected' : ''}${entry.stale ? ' stale' : ''}`
  );
  const isSelected = useComputed(() => (selected.value === pos ? 'true' : 'false'));
  const pending = useComputed(() => opening.value === entry.id);
  const isPR = entry.kind === 'pr';
  const hasWt = entry.kind === 'worktree' || entry.hasWorktree;
  const remoteOnly = isPR && !entry.hasWorktree;
  const showHint = useComputed(() => remoteOnly && selected.value === pos && !pending.value);

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
          <span class="palette-hint">Enter: create worktree</span>
        </Show>
        <Show when={pending}>
          <span class="palette-spinner" role="status" aria-label="Opening">
            <IconLoader2 size={14} stroke={1.5} />
          </span>
        </Show>
        {hasWt && <span class="palette-badge">worktree</span>}
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
