import { diff, findSelected, selectedCommit, sideBySide, viewMode } from '../state'

export function DiffToolbar() {
  const current = diff.value
  const entry = findSelected()
  const commit = selectedCommit.value
  const mode = viewMode.value

  let label: string | null = null
  if (current) {
    if (mode === 'graph' && commit) {
      label = commit.shortHash
    } else if (entry?.side === 'staged') {
      label = 'Staged'
    } else {
      label = 'Working Tree'
    }
  }

  return (
    <header class="diff-toolbar">
      <div class="diff-path">
        {current ? (
          <>
            <span class="side-label">{label}</span>
            <span class="path-text" title={commit ? `${commit.subject} — ${current.path}` : current.path}>
              {mode === 'graph' && commit ? `${commit.subject} · ${current.path}` : current.path}
            </span>
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
