import { diff, findSelected, selectedCommit, setAppTheme, sideBySide, THEMES, themeId, viewMode } from '../state'
import type { ThemeId } from '../theme/tokens'

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
        <label class="theme-picker">
          <span class="theme-label">Theme</span>
          <select
            value={themeId.value}
            onChange={(e) => {
              const next = (e.currentTarget as HTMLSelectElement).value as ThemeId
              void setAppTheme(next)
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
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
