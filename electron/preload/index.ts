import { contextBridge, ipcRenderer } from 'electron'
import type { ChangeSide, ConflictoApi } from '../../src/types'

const api: ConflictoApi = {
  openRepo: () => ipcRenderer.invoke('conflicto:open-repo'),
  listChanges: (root) => ipcRenderer.invoke('conflicto:list-changes', root),
  getFileDiff: (root, path, side: ChangeSide) =>
    ipcRenderer.invoke('conflicto:get-file-diff', root, path, side),
  listCommits: (root, limit) => ipcRenderer.invoke('conflicto:list-commits', root, limit),
  listCommitFiles: (root, hash) => ipcRenderer.invoke('conflicto:list-commit-files', root, hash),
  getCommitFileDiff: (root, hash, path) =>
    ipcRenderer.invoke('conflicto:get-commit-file-diff', root, hash, path),
  setChromeColor: (hex) => ipcRenderer.invoke('conflicto:set-chrome-color', hex),
}

contextBridge.exposeInMainWorld('conflicto', api)
