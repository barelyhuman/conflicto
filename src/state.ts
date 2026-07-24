import { signal, computed } from '@preact/signals'
import type {
  ChangeEntry,
  CommitFile,
  CommitInfo,
  FileDiff,
  RepoInfo,
  ViewMode,
} from './types'
import { applyTheme } from './theme/applyTheme'
import { DEFAULT_THEME_ID, THEMES } from './theme/themes'
import type { ThemeId } from './theme/tokens'

export const repo = signal<RepoInfo | null>(null)
export const changes = signal<ChangeEntry[]>([])
export const selectedKey = signal<string | null>(null)
export const diff = signal<FileDiff | null>(null)
export const sideBySide = signal(true)
export const loadingChanges = signal(false)
export const loadingDiff = signal(false)
export const error = signal<string | null>(null)

export const viewMode = signal<ViewMode>('changes')
export const commits = signal<CommitInfo[]>([])
export const loadingCommits = signal(false)
export const selectedCommitHash = signal<string | null>(null)
export const commitFiles = signal<CommitFile[]>([])
export const loadingCommitFiles = signal(false)

export const themeId = signal<ThemeId>(DEFAULT_THEME_ID)

export const staged = computed(() => changes.value.filter((c) => c.side === 'staged'))
export const unstaged = computed(() => changes.value.filter((c) => c.side === 'unstaged'))
export const selectedCommit = computed(
  () => commits.value.find((c) => c.hash === selectedCommitHash.value) ?? null,
)

export function changeKey(entry: ChangeEntry): string {
  return `${entry.side}:${entry.path}`
}

export function commitFileKey(hash: string, path: string): string {
  return `commit:${hash}:${path}`
}

export function findSelected(): ChangeEntry | null {
  const key = selectedKey.value
  if (!key || key.startsWith('commit:')) return null
  return changes.value.find((c) => changeKey(c) === key) ?? null
}

export async function openRepository() {
  error.value = null
  try {
    const info = await window.conflicto.openRepo()
    if (!info) return
    repo.value = info
    selectedKey.value = null
    diff.value = null
    selectedCommitHash.value = null
    commitFiles.value = []
    commits.value = []
    await Promise.all([refreshChanges(), refreshCommits()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function firstChange(): ChangeEntry | null {
  return staged.value[0] ?? unstaged.value[0] ?? null
}

export async function refreshChanges() {
  const current = repo.value
  if (!current) return
  loadingChanges.value = true
  error.value = null
  try {
    changes.value = await window.conflicto.listChanges(current.root)
    if (viewMode.value !== 'changes') return
    const key = selectedKey.value
    const stillPresent = key != null ? changes.value.find((c) => changeKey(c) === key) : null
    if (stillPresent) {
      await selectChange(stillPresent)
    } else {
      selectedKey.value = null
      diff.value = null
      const next = firstChange()
      if (next) await selectChange(next)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingChanges.value = false
  }
}

export async function refreshCommits() {
  const current = repo.value
  if (!current) return
  loadingCommits.value = true
  try {
    commits.value = await window.conflicto.listCommits(current.root)
    if (viewMode.value === 'graph' && !selectedCommitHash.value && commits.value[0]) {
      await selectCommit(commits.value[0].hash)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingCommits.value = false
  }
}

export async function setViewMode(mode: ViewMode) {
  if (viewMode.value === mode) return
  viewMode.value = mode
  selectedKey.value = null
  diff.value = null
  if (mode === 'changes') {
    selectedCommitHash.value = null
    commitFiles.value = []
    const next = firstChange()
    if (next) await selectChange(next)
    else await refreshChanges()
  } else {
    if (commits.value.length === 0) await refreshCommits()
    else if (!selectedCommitHash.value && commits.value[0]) {
      await selectCommit(commits.value[0].hash)
    } else if (selectedCommitHash.value && commitFiles.value[0]) {
      await selectCommitFile(selectedCommitHash.value, commitFiles.value[0].path)
    }
  }
}

export async function selectChange(entry: ChangeEntry) {
  const current = repo.value
  if (!current) return
  selectedCommitHash.value = null
  selectedKey.value = changeKey(entry)
  loadingDiff.value = true
  error.value = null
  try {
    diff.value = await window.conflicto.getFileDiff(current.root, entry.path, entry.side)
  } catch (e) {
    diff.value = null
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingDiff.value = false
  }
}

export async function selectCommit(hash: string) {
  const current = repo.value
  if (!current) return
  selectedCommitHash.value = hash
  loadingCommitFiles.value = true
  error.value = null
  try {
    commitFiles.value = await window.conflicto.listCommitFiles(current.root, hash)
    const first = commitFiles.value[0]
    if (first) await selectCommitFile(hash, first.path)
    else {
      selectedKey.value = null
      diff.value = null
    }
  } catch (e) {
    commitFiles.value = []
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingCommitFiles.value = false
  }
}

export async function selectCommitFile(hash: string, path: string) {
  const current = repo.value
  if (!current) return
  selectedCommitHash.value = hash
  selectedKey.value = commitFileKey(hash, path)
  loadingDiff.value = true
  error.value = null
  try {
    diff.value = await window.conflicto.getCommitFileDiff(current.root, hash, path)
  } catch (e) {
    diff.value = null
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingDiff.value = false
  }
}

export async function refreshAll() {
  if (viewMode.value === 'graph') {
    const hash = selectedCommitHash.value
    const key = selectedKey.value
    const path =
      hash && key?.startsWith(`commit:${hash}:`) ? key.slice(`commit:${hash}:`.length) : null
    await refreshCommits()
    if (!hash) return
    await selectCommit(hash)
    if (path && commitFiles.value.some((f) => f.path === path)) {
      await selectCommitFile(hash, path)
    }
  } else {
    await refreshChanges()
  }
}

export async function setAppTheme(id: ThemeId) {
  themeId.value = id
  await applyTheme(id)
}

export { THEMES }
