import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { RecentRepo } from '../../src/types'

const MAX_RECENT = 20
const FILE_NAME = 'recent-repos.json'

interface RecentStore {
  recent: Array<{ root: string; openedAt: number }>
}

function storePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function toRecentRepo(root: string, openedAt: number): RecentRepo {
  return {
    root,
    name: path.basename(root) || root,
    openedAt,
  }
}

async function pathExists(root: string): Promise<boolean> {
  try {
    await access(root)
    return true
  } catch {
    return false
  }
}

async function readStore(): Promise<RecentStore> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<RecentStore>
    if (!Array.isArray(parsed.recent)) return { recent: [] }
    return {
      recent: parsed.recent
        .filter(
          (e): e is { root: string; openedAt: number } =>
            !!e && typeof e.root === 'string' && typeof e.openedAt === 'number',
        )
        .map((e) => ({ root: path.resolve(e.root), openedAt: e.openedAt })),
    }
  } catch {
    return { recent: [] }
  }
}

async function writeStore(store: RecentStore): Promise<void> {
  const file = storePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(store, null, 2), 'utf8')
}

export async function listRecentRepos(): Promise<RecentRepo[]> {
  const store = await readStore()
  const kept: RecentStore['recent'] = []
  for (const entry of store.recent) {
    if (await pathExists(entry.root)) kept.push(entry)
  }
  kept.sort((a, b) => b.openedAt - a.openedAt)
  if (kept.length !== store.recent.length) {
    await writeStore({ recent: kept })
  }
  return kept.map((e) => toRecentRepo(e.root, e.openedAt))
}

export async function recordRecentRepo(root: string): Promise<RecentRepo[]> {
  const normalized = path.resolve(root)
  const store = await readStore()
  const next = store.recent.filter((e) => e.root !== normalized)
  next.unshift({ root: normalized, openedAt: Date.now() })
  const capped = next.slice(0, MAX_RECENT)
  await writeStore({ recent: capped })
  return capped.map((e) => toRecentRepo(e.root, e.openedAt))
}

export async function removeRecentRepo(root: string): Promise<RecentRepo[]> {
  const normalized = path.resolve(root)
  const store = await readStore()
  const next = store.recent.filter((e) => e.root !== normalized)
  await writeStore({ recent: next })
  return next
    .slice()
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((e) => toRecentRepo(e.root, e.openedAt))
}
