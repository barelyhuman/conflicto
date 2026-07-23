import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChangeEntry, ChangeSide, ChangeStatus, FileDiff, RepoInfo } from '../../src/types'

function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 })
    })
  })
}

async function gitOk(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args)
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

/** Returns stdout even when git exits non-zero (e.g. missing blob). */
async function gitSoft(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args)
  return result.stdout
}

function statusFromXY(char: string, untracked = false): ChangeStatus {
  if (untracked || char === '?') return 'untracked'
  switch (char) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    default:
      return 'modified'
  }
}

export async function resolveRepo(dir: string): Promise<RepoInfo> {
  const root = (await gitOk(dir, ['rev-parse', '--show-toplevel'])).trim()
  let branch = 'HEAD'
  try {
    branch = (await gitOk(root, ['branch', '--show-current'])).trim() || 'HEAD'
  } catch {
    branch = (await gitSoft(root, ['rev-parse', '--short', 'HEAD'])).trim() || 'HEAD'
  }
  return { root, branch }
}

export async function listChanges(root: string): Promise<ChangeEntry[]> {
  const stdout = await gitOk(root, ['status', '--porcelain=v1', '-uall', '-z'])
  const entries: ChangeEntry[] = []
  const parts = stdout.split('\0').filter(Boolean)

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (line.length < 3) continue

    const x = line[0]
    const y = line[1]
    // Format: XY PATH or XY ORIG -> PATH for renames (null-separated: path then old path follows in -z for R/C)
    const rest = line.slice(3)

    let filePath = rest
    let oldPath: string | undefined

    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      // With -z, rename is: "XY newpath\0oldpath"
      filePath = rest
      oldPath = parts[i + 1]
      i += 1
    }

    if (x === '?' && y === '?') {
      entries.push({ path: filePath, status: 'untracked', side: 'unstaged' })
      continue
    }

    if (x !== ' ' && x !== '?') {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromXY(x),
        side: 'staged',
      })
    }

    if (y !== ' ' && y !== '?') {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromXY(y),
        side: 'unstaged',
      })
    }
  }

  return entries
}

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.htm': 'html',
    '.rs': 'rust',
    '.py': 'python',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'ini',
    '.xml': 'xml',
    '.sql': 'sql',
    '.vue': 'html',
    '.svelte': 'html',
  }
  return map[ext] ?? 'plaintext'
}

async function readWorkingTree(root: string, filePath: string): Promise<string> {
  try {
    return await readFile(path.join(root, filePath), 'utf8')
  } catch {
    return ''
  }
}

async function readBlob(root: string, spec: string): Promise<string> {
  const result = await runGit(root, ['show', spec])
  if (result.code !== 0) return ''
  return result.stdout
}

export async function getFileDiff(root: string, filePath: string, side: ChangeSide): Promise<FileDiff> {
  const language = languageFromPath(filePath)

  if (side === 'staged') {
    // Staged: HEAD (or empty) vs index
    const original = await readBlob(root, `HEAD:${filePath}`)
    const modified = await readBlob(root, `:${filePath}`)
    return { path: filePath, original, modified, language }
  }

  // Unstaged: index (or HEAD for untracked empty index) vs working tree
  let original = await readBlob(root, `:${filePath}`)
  if (!original) {
    original = await readBlob(root, `HEAD:${filePath}`)
  }
  const modified = await readWorkingTree(root, filePath)
  return { path: filePath, original, modified, language }
}
