import { IconColumns2, IconPencil } from '@tabler/icons-preact';

/**
 * Toggle between diff view and inline file editor.
 *
 * @param {Object} props
 * @param {'diff' | 'edit'} props.mode
 * @param {() => void} props.onToggle
 */
export function ViewModeToggle({ mode, onToggle }) {
  const isEdit = mode === 'edit';

  return (
    <div class="view-mode-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        class={`view-mode-btn${isEdit ? '' : ' active'}`}
        onClick={onToggle}
        title="Diff view"
        aria-label="Diff view"
        aria-pressed={!isEdit}
        disabled={!isEdit}
      >
        <IconColumns2 size={12} stroke={1.75} />
      </button>
      <button
        type="button"
        class={`view-mode-btn${isEdit ? ' active' : ''}`}
        onClick={onToggle}
        title="Edit file"
        aria-label="Edit file"
        aria-pressed={isEdit}
        disabled={isEdit}
      >
        <IconPencil size={12} stroke={1.75} />
      </button>
    </div>
  );
}
