import { contextBridge, ipcRenderer } from 'electron'
import type { ChangeSide, ConflictoApi } from '../../src/types'

const api: ConflictoApi = {
  openRepo: () => ipcRenderer.invoke('conflicto:open-repo'),
  openRepoPath: (path) => ipcRenderer.invoke('conflicto:open-repo-path', path),
  getRecentRepos: () => ipcRenderer.invoke('conflicto:get-recent-repos'),
  removeRecentRepo: (root) => ipcRenderer.invoke('conflicto:remove-recent-repo', root),
  listChanges: (root) => ipcRenderer.invoke('conflicto:list-changes', root),
  stagePaths: (root, paths) => ipcRenderer.invoke('conflicto:stage-paths', root, paths),
  unstagePaths: (root, paths) => ipcRenderer.invoke('conflicto:unstage-paths', root, paths),
  getFileDiff: (root, path, side: ChangeSide) =>
    ipcRenderer.invoke('conflicto:get-file-diff', root, path, side),
  listCommits: (root, limit) => ipcRenderer.invoke('conflicto:list-commits', root, limit),
  listCommitFiles: (root, hash) => ipcRenderer.invoke('conflicto:list-commit-files', root, hash),
  getCommitFileDiff: (root, hash, path) =>
    ipcRenderer.invoke('conflicto:get-commit-file-diff', root, hash, path),
  setChromeColor: (hex) => ipcRenderer.invoke('conflicto:set-chrome-color', hex),
  terminal: {
    start: (opts) => ipcRenderer.invoke('conflicto:terminal-start', opts),
    write: (data) => ipcRenderer.invoke('conflicto:terminal-write', data),
    resize: (cols, rows) => ipcRenderer.invoke('conflicto:terminal-resize', { cols, rows }),
    stop: () => ipcRenderer.invoke('conflicto:terminal-stop'),
    onData: (listener) => {
      const handler = (_event: unknown, data: string) => listener(data)
      ipcRenderer.on('conflicto:terminal-data', handler)
      return () => ipcRenderer.removeListener('conflicto:terminal-data', handler)
    },
    onExit: (listener) => {
      const handler = () => listener()
      ipcRenderer.on('conflicto:terminal-exit', handler)
      return () => ipcRenderer.removeListener('conflicto:terminal-exit', handler)
    },
  },
}

contextBridge.exposeInMainWorld('conflicto', api)
