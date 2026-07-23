export type ChangeSide = 'staged' | 'unstaged'

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'

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

export interface ConflictoApi {
  openRepo: () => Promise<RepoInfo | null>
  listChanges: (root: string) => Promise<ChangeEntry[]>
  getFileDiff: (root: string, path: string, side: ChangeSide) => Promise<FileDiff>
}

declare global {
  interface Window {
    conflicto: ConflictoApi
  }
}
