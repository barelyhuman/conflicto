import { useEffect, useRef, useState } from 'preact/hooks'
import type { RecentRepo } from '../types'
import {
  forgetRecentRepo,
  openRepository,
  openRepositoryPath,
  recentRepos,
  repo,
} from '../state'

const IDLE_LIMIT = 5

function folderName(root: string): string {
  const parts = root.replace(/\/+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || root
}

function filterRepos(repos: RecentRepo[], query: string): RecentRepo[] {
  const q = query.trim().toLowerCase()
  if (!q) return repos.slice(0, IDLE_LIMIT)
  return repos.filter(
    (r) => r.name.toLowerCase().includes(q) || r.root.toLowerCase().includes(q),
  )
}

export function RepoSwitcher() {
  const current = repo.value
  const repos = recentRepos.value
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [opening, setOpening] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = filterRepos(repos, query)
  const trimmed = query.trim()
  const exactMatch = trimmed
    ? repos.find((r) => r.root === trimmed || r.root.toLowerCase() === trimmed.toLowerCase())
    : undefined
  const showGoto =
    !!trimmed &&
    !matches.some((r) => r.root === trimmed) &&
    (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes(':'))

  const rows: Array<{ kind: 'recent'; repo: RecentRepo } | { kind: 'goto'; path: string }> = [
    ...matches.map((r) => ({ kind: 'recent' as const, repo: r })),
    ...(showGoto ? [{ kind: 'goto' as const, path: trimmed }] : []),
  ]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  async function chooseRecent(entry: RecentRepo) {
    if (current?.root === entry.root) {
      setOpen(false)
      return
    }
    setOpening(true)
    try {
      await openRepositoryPath(entry.root)
      setOpen(false)
    } catch {
      // error signal set in state
    } finally {
      setOpening(false)
    }
  }

  async function chooseGoto(path: string) {
    setOpening(true)
    try {
      await openRepositoryPath(path)
      setOpen(false)
    } catch {
      // error signal set in state
    } finally {
      setOpening(false)
    }
  }

  async function browse() {
    setOpen(false)
    await openRepository()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rows.length === 0) return
      setHighlight((h) => (h + 1) % rows.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length === 0) return
      setHighlight((h) => (h - 1 + rows.length) % rows.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[highlight]
      if (row?.kind === 'recent') void chooseRecent(row.repo)
      else if (row?.kind === 'goto') void chooseGoto(row.path)
      else if (exactMatch) void chooseRecent(exactMatch)
      else if (trimmed) void chooseGoto(trimmed)
      return
    }
  }

  const label = current ? folderName(current.root) : 'Open repository…'

  return (
    <div class={`repo-switcher ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        class="repo-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        title={current?.root ?? 'Open repository'}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span class="repo-switcher-label">{label}</span>
        <span class="repo-switcher-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div class="repo-switcher-popover" role="listbox">
          <input
            ref={inputRef}
            class="repo-switcher-input"
            type="text"
            value={query}
            placeholder="Search or enter path…"
            disabled={opening}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={onKeyDown}
          />

          <div class="repo-switcher-results">
            {rows.length === 0 && !trimmed && (
              <p class="repo-switcher-empty">No recent repositories</p>
            )}
            {rows.length === 0 && trimmed && !showGoto && (
              <p class="repo-switcher-empty">No matching repositories</p>
            )}
            {rows.map((row, i) => {
              if (row.kind === 'goto') {
                return (
                  <button
                    key={`goto:${row.path}`}
                    type="button"
                    class={`repo-switcher-row ${i === highlight ? 'highlight' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => void chooseGoto(row.path)}
                    disabled={opening}
                  >
                    <span class="repo-switcher-name">Open “{row.path}”</span>
                    <span class="repo-switcher-path">Go to path</span>
                  </button>
                )
              }
              const entry = row.repo
              const active = current?.root === entry.root
              return (
                <div
                  key={entry.root}
                  class={`repo-switcher-row-wrap ${i === highlight ? 'highlight' : ''} ${active ? 'active' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <button
                    type="button"
                    class="repo-switcher-row"
                    onClick={() => void chooseRecent(entry)}
                    disabled={opening}
                  >
                    <span class="repo-switcher-name">{entry.name}</span>
                    <span class="repo-switcher-path" title={entry.root}>
                      {entry.root}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="repo-switcher-forget"
                    title="Remove from recent"
                    aria-label={`Remove ${entry.name} from recent`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void forgetRecentRepo(entry.root)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          <button type="button" class="repo-switcher-browse" onClick={() => void browse()} disabled={opening}>
            Browse…
          </button>
        </div>
      )}
    </div>
  )
}
