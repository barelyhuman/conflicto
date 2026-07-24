import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import {
  getCommitFileDiff,
  getFileDiff,
  listCommitFiles,
  listCommits,
  listChanges,
  resolveRepo,
  stagePaths,
  unstagePaths,
} from './git'
import { listRecentRepos, recordRecentRepo, removeRecentRepo } from './recentRepos'
import type { ChangeSide } from '../../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function registerIpc() {
  ipcMain.handle('conflicto:get-recent-repos', async () => {
    return listRecentRepos()
  })

  ipcMain.handle('conflicto:remove-recent-repo', async (_event, root: string) => {
    return removeRecentRepo(root)
  })

  ipcMain.handle('conflicto:open-repo', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Open Git Repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const info = await resolveRepo(result.filePaths[0])
    await recordRecentRepo(info.root)
    return info
  })

  ipcMain.handle('conflicto:open-repo-path', async (_event, dir: string) => {
    if (typeof dir !== 'string' || !dir.trim()) {
      throw new Error('Path is required')
    }
    const info = await resolveRepo(dir.trim())
    await recordRecentRepo(info.root)
    return info
  })

  ipcMain.handle('conflicto:list-changes', async (_event, root: string) => {
    return listChanges(root)
  })

  ipcMain.handle('conflicto:stage-paths', async (_event, root: string, paths: string[]) => {
    await stagePaths(root, paths)
  })

  ipcMain.handle('conflicto:unstage-paths', async (_event, root: string, paths: string[]) => {
    await unstagePaths(root, paths)
  })

  ipcMain.handle(
    'conflicto:get-file-diff',
    async (_event, root: string, filePath: string, side: ChangeSide) => {
      return getFileDiff(root, filePath, side)
    },
  )

  ipcMain.handle('conflicto:list-commits', async (_event, root: string, limit?: number) => {
    return listCommits(root, limit)
  })

  ipcMain.handle('conflicto:list-commit-files', async (_event, root: string, hash: string) => {
    return listCommitFiles(root, hash)
  })

  ipcMain.handle(
    'conflicto:get-commit-file-diff',
    async (_event, root: string, hash: string, filePath: string) => {
      return getCommitFileDiff(root, hash, filePath)
    },
  )

  ipcMain.handle('conflicto:set-chrome-color', async (_event, hex: string) => {
    if (!win || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    win.setBackgroundColor(hex)
  })
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Conflicto',
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1e1e1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
