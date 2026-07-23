import type { ChangeEntry } from '../types'
import {
  changeKey,
  loadingChanges,
  openRepository,
  refreshChanges,
  repo,
  selectChange,
  selectedKey,
  staged,
  unstaged,
} from '../state'

function statusLetter(status: ChangeEntry['status']): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    default:
      return 'M'
  }
}

function FileRow({ entry }: { entry: ChangeEntry }) {
  const key = changeKey(entry)
  const active = selectedKey.value === key
  return (
    <button
      type="button"
      class={`file-row ${active ? 'active' : ''}`}
      onClick={() => selectChange(entry)}
    >
      <span class={`status status-${entry.status}`}>{statusLetter(entry.status)}</span>
      <span class="file-path" title={entry.path}>
        {entry.path}
      </span>
    </button>
  )
}

function Section({ title, entries }: { title: string; entries: ChangeEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section class="change-section">
      <header class="section-header">
        <span>{title}</span>
        <span class="count">{entries.length}</span>
      </header>
      <div class="file-list">
        {entries.map((entry) => (
          <FileRow key={changeKey(entry)} entry={entry} />
        ))}
      </div>
    </section>
  )
}

export function RepoSidebar() {
  const current = repo.value
  const stagedEntries = staged.value
  const unstagedEntries = unstaged.value
  const empty = stagedEntries.length === 0 && unstagedEntries.length === 0

  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <button type="button" class="btn primary" onClick={() => openRepository()}>
          Open Repo
        </button>
        <button
          type="button"
          class="btn"
          disabled={!current || loadingChanges.value}
          onClick={() => refreshChanges()}
          title="Refresh"
        >
          {loadingChanges.value ? '…' : '↻'}
        </button>
      </div>

      {current ? (
        <div class="repo-meta" title={current.root}>
          <div class="branch">{current.branch}</div>
          <div class="root">{current.root}</div>
        </div>
      ) : (
        <p class="sidebar-empty">Open a git repository to view changes.</p>
      )}

      {current && empty && !loadingChanges.value && (
        <p class="sidebar-empty">No changes in the working tree.</p>
      )}

      <Section title="Staged" entries={stagedEntries} />
      <Section title="Changes" entries={unstagedEntries} />
    </aside>
  )
}
