export type ChangeSide = 'staged' | 'unstaged'

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'

export type ViewMode = 'changes' | 'graph'

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

export interface ConflictoApi {
  openRepo: () => Promise<RepoInfo | null>
  listChanges: (root: string) => Promise<ChangeEntry[]>
  getFileDiff: (root: string, path: string, side: ChangeSide) => Promise<FileDiff>
  listCommits: (root: string, limit?: number) => Promise<CommitInfo[]>
  listCommitFiles: (root: string, hash: string) => Promise<CommitFile[]>
  getCommitFileDiff: (root: string, hash: string, path: string) => Promise<FileDiff>
}

declare global {
  interface Window {
    conflicto: ConflictoApi
  }
}
