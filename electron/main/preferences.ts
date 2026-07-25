import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { AppPreferences, ThemeId } from '../../src/types'

const FILE_NAME = 'preferences.json'
const DEFAULT_THEME_ID: ThemeId = 'pierre-dark'
const DEFAULT_TERMINAL_HEIGHT = 200
const MIN_TERMINAL_HEIGHT = 120
const MAX_TERMINAL_HEIGHT = 5000

const VALID_THEME_IDS = new Set<ThemeId>([
  'pierre-dark',
  'pierre-light',
  'dark-plus',
  'light-plus',
  'rose-pine',
  'rose-pine-moon',
  'rose-pine-dawn',
])

const DEFAULTS: AppPreferences = {
  themeId: DEFAULT_THEME_ID,
  terminalHeight: DEFAULT_TERMINAL_HEIGHT,
  lastRepoPath: null,
}

function storePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && VALID_THEME_IDS.has(value as ThemeId)
}

function normalizeHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TERMINAL_HEIGHT
  return Math.min(MAX_TERMINAL_HEIGHT, Math.max(MIN_TERMINAL_HEIGHT, Math.round(value)))
}

function normalizeLastRepoPath(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string' || !value.trim()) return null
  return path.resolve(value.trim())
}

function normalize(raw: Partial<AppPreferences> | null | undefined): AppPreferences {
  return {
    themeId: isThemeId(raw?.themeId) ? raw.themeId : DEFAULTS.themeId,
    terminalHeight: normalizeHeight(raw?.terminalHeight),
    lastRepoPath: normalizeLastRepoPath(raw?.lastRepoPath),
  }
}

async function readStore(): Promise<AppPreferences> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    return normalize(parsed)
  } catch {
    return { ...DEFAULTS }
  }
}

async function writeStore(prefs: AppPreferences): Promise<void> {
  const file = storePath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(prefs, null, 2), 'utf8')
}

export async function getPreferences(): Promise<AppPreferences> {
  return readStore()
}

export async function setPreferences(partial: Partial<AppPreferences>): Promise<AppPreferences> {
  const current = await readStore()
  const next = normalize({
    themeId: partial.themeId !== undefined ? partial.themeId : current.themeId,
    terminalHeight:
      partial.terminalHeight !== undefined ? partial.terminalHeight : current.terminalHeight,
    lastRepoPath: partial.lastRepoPath !== undefined ? partial.lastRepoPath : current.lastRepoPath,
  })
  await writeStore(next)
  return next
}
