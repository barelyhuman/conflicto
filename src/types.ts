import type { ThemeId } from './theme/tokens'

export type { ThemeId }

export type ChangeSide = 'staged' | 'unstaged'

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'

export type ViewMode = 'changes' | 'graph'

export interface AppPreferences {
  themeId: ThemeId
  terminalHeight: number
  lastRepoPath: string | null
}

export interface ChangeEntry {
  path: string
  /** Previous path when renamed/copied */
  oldPath?: string
  status: ChangeStatus
  side: ChangeSide
}

export interface RepoInfo {
  root: string
  branch: string
}

export interface RecentRepo {
  root: string
  name: string
  openedAt: number
}

export interface FileDiff {
  path: string
  original: string
  modified: string
  language: string
}

export interface CommitInfo {
  hash: string
  shortHash: string
  parents: string[]
  subject: string
  author: string
  date: string
  refs: string[]
}

export interface CommitFile {
  path: string
  oldPath?: string
  status: ChangeStatus
}

export interface TerminalApi {
  start: (opts?: { cwd?: string | null; cols?: number; rows?: number }) => Promise<{ cwd: string | null }>
  write: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  stop: () => Promise<void>
  onData: (listener: (data: string) => void) => () => void
  onExit: (listener: () => void) => () => void
}

export interface ConflictoApi {
  openRepo: () => Promise<RepoInfo | null>
  openRepoPath: (path: string) => Promise<RepoInfo>
  getRecentRepos: () => Promise<RecentRepo[]>
  removeRecentRepo: (root: string) => Promise<RecentRepo[]>
  getPreferences: () => Promise<AppPreferences>
  setPreferences: (partial: Partial<AppPreferences>) => Promise<AppPreferences>
  listChanges: (root: string) => Promise<ChangeEntry[]>
  stagePaths: (root: string, paths: string[]) => Promise<void>
  unstagePaths: (root: string, paths: string[]) => Promise<void>
  getFileDiff: (root: string, path: string, side: ChangeSide) => Promise<FileDiff>
  listCommits: (root: string, limit?: number) => Promise<CommitInfo[]>
  listCommitFiles: (root: string, hash: string) => Promise<CommitFile[]>
  getCommitFileDiff: (root: string, hash: string, path: string) => Promise<FileDiff>
  setChromeColor: (hex: string) => Promise<void>
  terminal: TerminalApi
}

declare global {
  interface Window {
    conflicto: ConflictoApi
  }
}
