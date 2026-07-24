import { useEffect } from 'preact/hooks'
import { RepoSidebar } from './components/RepoSidebar'
import { DiffToolbar } from './components/DiffToolbar'
import { MonacoDiffView } from './components/MonacoDiffView'
import {
  diff,
  error,
  loadRecentRepos,
  loadingDiff,
  openRepository,
  refreshAll,
  repo,
  selectedKey,
} from './state'

export function App() {
  useEffect(() => {
    void loadRecentRepos()

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        openRepository()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r' && repo.value) {
        e.preventDefault()
        refreshAll()
      }
    }
    window.addEventListener('keydown', onKey)

    const onFocus = () => {
      if (repo.value) refreshAll()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const hasSelection = selectedKey.value !== null
  const hasDiff = diff.value !== null

  return (
    <div class="app">
      <main class="main">
        <DiffToolbar />
        <div class="diff-stage">
          {error.value && <div class="banner error">{error.value}</div>}
          {!repo.value && (
            <div class="empty">
              <h1>Conflicto</h1>
              <p>Open a repository to inspect staged and unstaged diffs.</p>
              <button type="button" class="btn primary" onClick={() => openRepository()}>
                Open Repository
              </button>
              <p class="hint">⌘O / Ctrl+O</p>
            </div>
          )}
          {repo.value && !hasSelection && (
            <div class="empty subtle">
              <p>Select a file from the sidebar.</p>
            </div>
          )}
          {repo.value && hasSelection && loadingDiff.value && !hasDiff && (
            <div class="empty subtle">
              <p>Loading diff…</p>
            </div>
          )}
          {hasDiff && <MonacoDiffView />}
        </div>
      </main>
      <RepoSidebar />
    </div>
  )
}
