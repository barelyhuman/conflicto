import { diff, findSelected, sideBySide } from '../state'

export function DiffToolbar() {
  const current = diff.value
  const entry = findSelected()

  return (
    <header class="diff-toolbar">
      <div class="diff-path">
        {current ? (
          <>
            <span class="side-label">{entry?.side === 'staged' ? 'Staged' : 'Working Tree'}</span>
            <span class="path-text">{current.path}</span>
          </>
        ) : (
          <span class="path-muted">Select a file to diff</span>
        )}
      </div>
      <div class="toolbar-actions">
        <button
          type="button"
          class={`btn toggle ${sideBySide.value ? 'active' : ''}`}
          disabled={!current}
          onClick={() => {
            sideBySide.value = !sideBySide.value
          }}
        >
          {sideBySide.value ? 'Side by Side' : 'Inline'}
        </button>
      </div>
    </header>
  )
}
