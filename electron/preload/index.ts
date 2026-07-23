import { contextBridge, ipcRenderer } from 'electron'
import type { ChangeSide, ConflictoApi } from '../../src/types'

const api: ConflictoApi = {
  openRepo: () => ipcRenderer.invoke('conflicto:open-repo'),
  listChanges: (root) => ipcRenderer.invoke('conflicto:list-changes', root),
  getFileDiff: (root, path, side: ChangeSide) =>
    ipcRenderer.invoke('conflicto:get-file-diff', root, path, side),
}

contextBridge.exposeInMainWorld('conflicto', api)
