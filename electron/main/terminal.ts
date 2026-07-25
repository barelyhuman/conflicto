import os from 'node:os'
import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import * as pty from 'node-pty'

let session: pty.IPty | null = null
let sessionCwd: string | null = null
let sessionId = 0
let activeId: number | null = null
const suppressedIds = new Set<number>()
let getWindow: (() => BrowserWindow | null) | null = null

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

function defaultCwd(cwd?: string | null): string {
  if (cwd && cwd.trim()) return cwd
  return os.homedir()
}

function disposeSession() {
  if (!session || activeId == null) return
  const id = activeId
  suppressedIds.add(id)
  try {
    session.kill()
  } catch {
    // ignore
  }
  session = null
  sessionCwd = null
  activeId = null
}

function startSession(cwd: string | null | undefined, cols = 80, rows = 24) {
  disposeSession()
  const resolved = defaultCwd(cwd)
  const id = ++sessionId
  activeId = id
  sessionCwd = resolved
  session = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: resolved,
    env: process.env as Record<string, string>,
  })

  session.onData((data) => {
    if (activeId !== id) return
    const win = getWindow?.()
    win?.webContents.send('conflicto:terminal-data', data)
  })

  session.onExit(() => {
    if (activeId === id) {
      session = null
      sessionCwd = null
      activeId = null
    }
    if (suppressedIds.has(id)) {
      suppressedIds.delete(id)
      return
    }
    const win = getWindow?.()
    win?.webContents.send('conflicto:terminal-exit')
  })
}

export function registerTerminalIpc(resolveWindow: () => BrowserWindow | null) {
  getWindow = resolveWindow

  ipcMain.handle(
    'conflicto:terminal-start',
    async (_event, opts?: { cwd?: string | null; cols?: number; rows?: number }) => {
      const cols = opts?.cols ?? 80
      const rows = opts?.rows ?? 24
      // Keep an existing session alive across repo switches — ignore requested cwd.
      if (session) {
        session.resize(cols, rows)
        return { cwd: sessionCwd }
      }
      startSession(opts?.cwd, cols, rows)
      return { cwd: sessionCwd }
    },
  )

  ipcMain.handle('conflicto:terminal-write', async (_event, data: string) => {
    if (!session || typeof data !== 'string') return
    session.write(data)
  })

  ipcMain.handle(
    'conflicto:terminal-resize',
    async (_event, size: { cols: number; rows: number }) => {
      if (!session || !size) return
      const cols = Math.max(2, Math.floor(size.cols))
      const rows = Math.max(1, Math.floor(size.rows))
      session.resize(cols, rows)
    },
  )

  ipcMain.handle('conflicto:terminal-stop', async () => {
    disposeSession()
  })
}

export function disposeTerminal() {
  disposeSession()
}
