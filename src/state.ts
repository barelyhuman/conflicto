import { signal, computed } from '@preact/signals'
import type { ChangeEntry, FileDiff, RepoInfo } from './types'

export const repo = signal<RepoInfo | null>(null)
export const changes = signal<ChangeEntry[]>([])
export const selectedKey = signal<string | null>(null)
export const diff = signal<FileDiff | null>(null)
export const sideBySide = signal(true)
export const loadingChanges = signal(false)
export const loadingDiff = signal(false)
export const error = signal<string | null>(null)

export const staged = computed(() => changes.value.filter((c) => c.side === 'staged'))
export const unstaged = computed(() => changes.value.filter((c) => c.side === 'unstaged'))

export function changeKey(entry: ChangeEntry): string {
  return `${entry.side}:${entry.path}`
}

export function findSelected(): ChangeEntry | null {
  const key = selectedKey.value
  if (!key) return null
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
    await refreshChanges()
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
    const key = selectedKey.value
    const stillPresent = key != null && changes.value.some((c) => changeKey(c) === key)
    if (!stillPresent) {
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

export async function selectChange(entry: ChangeEntry) {
  const current = repo.value
  if (!current) return
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
