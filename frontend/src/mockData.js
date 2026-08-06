/**
 * @typedef {Object} DiffLine
 * @property {'context'|'add'|'remove'} type
 * @property {number|null} oldLineNo
 * @property {number|null} newLineNo
 * @property {string} content
 */

/**
 * @typedef {Object} FileDiff
 * @property {string} path
 * @property {'M'|'A'|'D'|'R'} status
 * @property {string} oldPath
 * @property {DiffLine[]} lines
 * @property {number} additions
 * @property {number} deletions
 */

/** @type {string[]} */
export const localBranches = [
  'main',
  'develop',
  'feature/diff-ui',
  'fix/memory-leak',
  'chore/update-deps',
];

/** @type {string[]} */
export const remoteBranches = [
  'origin/main',
  'origin/develop',
  'origin/feature/diff-ui',
  'origin/release/v2.1',
];

/** @type {FileDiff[]} */
export const stagedFiles = [
  {
    path: 'src/components/DiffViewer.jsx',
    status: 'M',
    oldPath: 'src/components/DiffViewer.jsx',
    additions: 14,
    deletions: 6,
    lines: [
      { type: 'context', oldLineNo: 1, newLineNo: 1, content: "import { useState } from 'preact/hooks';" },
      { type: 'context', oldLineNo: 2, newLineNo: 2, content: "import './styles.css';" },
      { type: 'context', oldLineNo: 3, newLineNo: 3, content: '' },
      { type: 'context', oldLineNo: 4, newLineNo: 4, content: 'export function DiffViewer({ diff }) {' },
      { type: 'context', oldLineNo: 5, newLineNo: 5, content: '  const [sideBySide, setSideBySide] = useState(true);' },
      { type: 'remove', oldLineNo: 6, newLineNo: null, content: '  const lines = diff.split("\\n");' },
      { type: 'add', oldLineNo: null, newLineNo: 6, content: '  const lines = parseDiff(diff);' },
      { type: 'add', oldLineNo: null, newLineNo: 7, content: '  const stats = computeStats(lines);' },
      { type: 'context', oldLineNo: 7, newLineNo: 8, content: '' },
      { type: 'context', oldLineNo: 8, newLineNo: 9, content: '  return (' },
      { type: 'remove', oldLineNo: 9, newLineNo: null, content: '    <div className="diff">' },
      { type: 'add', oldLineNo: null, newLineNo: 10, content: '    <div className="diff-container">' },
      { type: 'context', oldLineNo: 10, newLineNo: 11, content: '      <DiffHeader' },
      { type: 'context', oldLineNo: 11, newLineNo: 12, content: '        filename={diff.filename}' },
      { type: 'context', oldLineNo: 12, newLineNo: 13, content: '        additions={diff.additions}' },
      { type: 'context', oldLineNo: 13, newLineNo: 14, content: '        deletions={diff.deletions}' },
      { type: 'context', oldLineNo: 14, newLineNo: 15, content: '      />' },
      { type: 'remove', oldLineNo: 15, newLineNo: null, content: '      <pre>{lines}</pre>' },
      { type: 'add', oldLineNo: null, newLineNo: 16, content: '      <SplitView lines={lines} />' },
      { type: 'context', oldLineNo: 16, newLineNo: 17, content: '    </div>' },
      { type: 'context', oldLineNo: 17, newLineNo: 18, content: '  );' },
      { type: 'context', oldLineNo: 18, newLineNo: 19, content: '}' },
    ],
  },
  {
    path: 'src/utils/parseDiff.js',
    status: 'A',
    oldPath: '',
    additions: 28,
    deletions: 0,
    lines: [
      { type: 'add', oldLineNo: null, newLineNo: 1, content: '/**' },
      { type: 'add', oldLineNo: null, newLineNo: 2, content: ' * Parse a unified diff string into structured line data.' },
      { type: 'add', oldLineNo: null, newLineNo: 3, content: ' */' },
      { type: 'add', oldLineNo: null, newLineNo: 4, content: 'export function parseDiff(diffText) {' },
      { type: 'add', oldLineNo: null, newLineNo: 5, content: '  const lines = [];' },
      { type: 'add', oldLineNo: null, newLineNo: 6, content: '  const rawLines = diffText.split("\\n");' },
      { type: 'add', oldLineNo: null, newLineNo: 7, content: '' },
      { type: 'add', oldLineNo: null, newLineNo: 8, content: '  for (const line of rawLines) {' },
      { type: 'add', oldLineNo: null, newLineNo: 9, content: '    if (line.startsWith("@@")) {' },
      { type: 'add', oldLineNo: null, newLineNo: 10, content: '      // Hunk header — skip for now' },
      { type: 'add', oldLineNo: null, newLineNo: 11, content: '      continue;' },
      { type: 'add', oldLineNo: null, newLineNo: 12, content: '    }' },
      { type: 'add', oldLineNo: null, newLineNo: 13, content: '' },
      { type: 'add', oldLineNo: null, newLineNo: 14, content: '    if (line.startsWith("+")) {' },
      { type: 'add', oldLineNo: null, newLineNo: 15, content: '      lines.push({ type: "add", content: line.slice(1) });' },
      { type: 'add', oldLineNo: null, newLineNo: 16, content: '    } else if (line.startsWith("-")) {' },
      { type: 'add', oldLineNo: null, newLineNo: 17, content: '      lines.push({ type: "remove", content: line.slice(1) });' },
      { type: 'add', oldLineNo: null, newLineNo: 18, content: '    } else {' },
      { type: 'add', oldLineNo: null, newLineNo: 19, content: '      lines.push({ type: "context", content: line });' },
      { type: 'add', oldLineNo: null, newLineNo: 20, content: '    }' },
      { type: 'add', oldLineNo: null, newLineNo: 21, content: '  }' },
      { type: 'add', oldLineNo: null, newLineNo: 22, content: '' },
      { type: 'add', oldLineNo: null, newLineNo: 23, content: '  return lines;' },
      { type: 'add', oldLineNo: null, newLineNo: 24, content: '}' },
    ],
  },
];

/** @typedef {Object} PullRequest
 * @property {number} number
 * @property {string} title
 * @property {string} author
 * @property {string} baseBranch
 * @property {string} worktreePath
 * @property {FileDiff[]} files
 */

const MOCK_TITLES = [
  'Refactor authentication flow',
  'Fix memory leak in parser',
  'Update README badges',
  'Add dark mode toggle',
  'Update dependencies',
  'Implement virtual scrolling',
  'Fix race condition in cache',
  'Add keyboard shortcuts',
  'Optimize diff rendering',
  'Support large file diffs',
  'Add PR comments',
  'Fix sidebar scroll bug',
  'Add CI pipeline',
  'Fix Go lint errors',
  'Implement search filtering',
  'Add debounce to inputs',
  'Fix worktree checkout',
  'Support merge conflicts',
  'Add toast notifications',
  'Fix status bar layout',
  'Implement SWR caching',
  'Add project picker',
  'Fix branch switching',
  'Support multiple remotes',
  'Add preferences page',
  'Fix build script',
  'Add wails integration',
  'Support git LFS',
  'Fix Unicode filenames',
  'Add drag and drop',
];

const AUTHORS = ['sarah-chen', 'alex-k', 'jordan-m', 'taylor-r'];
const BASES = ['main', 'develop'];

/** @type {PullRequest[]} */
export const pullRequests = MOCK_TITLES.map((title, i) => ({
  number: 100 + i,
  title,
  author: AUTHORS[i % AUTHORS.length],
  baseBranch: BASES[i % BASES.length],
  worktreePath: '',
  files: [],
}));

/** @type {FileDiff[]} */
export const conflictFiles = [
  {
    path: 'src/components/SessionManager.tsx',
    status: 'C',
    oldPath: 'src/components/SessionManager.tsx',
    additions: 12,
    deletions: 6,
    lines: [
      { type: 'context', oldLineNo: 18, newLineNo: 18, content: 'export async function createSession(userId: string) {' },
      { type: 'context', oldLineNo: 19, newLineNo: 19, content: '  await cleanupExpiredSessions(userId);' },
      { type: 'context', oldLineNo: 20, newLineNo: 20, content: '' },
      { type: 'marker-ours', oldLineNo: 21, newLineNo: 21, content: '<<<<<<< HEAD' },
      { type: 'ours', oldLineNo: 22, newLineNo: null, content: '  const data = {' },
      { type: 'ours', oldLineNo: 23, newLineNo: null, content: '    provider: "password",' },
      { type: 'marker-sep', oldLineNo: 24, newLineNo: 24, content: '=======' },
      { type: 'theirs', oldLineNo: null, newLineNo: 25, content: '  const sessionData = {' },
      { type: 'theirs', oldLineNo: null, newLineNo: 26, content: '    source: "web",' },
      { type: 'marker-end', oldLineNo: 27, newLineNo: 27, content: '>>>>>>> feature/oauth-session-source' },
      { type: 'context', oldLineNo: 28, newLineNo: 28, content: '    userId,' },
      { type: 'context', oldLineNo: 29, newLineNo: 29, content: '    expiresAt: Date.now() + SESSION_TTL,' },
      { type: 'context', oldLineNo: 30, newLineNo: 30, content: '  };' },
      { type: 'context', oldLineNo: 31, newLineNo: 31, content: '' },
      { type: 'context', oldLineNo: 32, newLineNo: 32, content: '  const session = await db.session.create(data);' },
      { type: 'context', oldLineNo: 33, newLineNo: 33, content: '  const token = generateToken(session.id);' },
      { type: 'context', oldLineNo: 34, newLineNo: 34, content: '' },
      { type: 'context', oldLineNo: 35, newLineNo: 35, content: '  if (oldest) await invalidateSession(oldest.id);' },
      { type: 'context', oldLineNo: 36, newLineNo: 36, content: '  }' },
      { type: 'context', oldLineNo: 37, newLineNo: 37, content: '' },
      { type: 'context', oldLineNo: 38, newLineNo: 38, content: '  return { session, token };' },
      { type: 'context', oldLineNo: 39, newLineNo: 39, content: '}' },
    ],
  },
];

/** @type {FileDiff[]} */
export const unstagedFiles = [
  {
    path: 'src/index.css',
    status: 'M',
    oldPath: 'src/index.css',
    additions: 8,
    deletions: 12,
    lines: [
      { type: 'context', oldLineNo: 1, newLineNo: 1, content: ':root {' },
      { type: 'context', oldLineNo: 2, newLineNo: 2, content: '  --font-sans: system-ui, sans-serif;' },
      { type: 'context', oldLineNo: 3, newLineNo: 3, content: '  --font-mono: ui-monospace, monospace;' },
      { type: 'remove', oldLineNo: 4, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 5, newLineNo: null, content: '  --bg: #ffffff;' },
      { type: 'remove', oldLineNo: 6, newLineNo: null, content: '  --text: #1a1a1a;' },
      { type: 'remove', oldLineNo: 7, newLineNo: null, content: '  --muted: #737373;' },
      { type: 'remove', oldLineNo: 8, newLineNo: null, content: '  --border: #e5e5e5;' },
      { type: 'remove', oldLineNo: 9, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 10, newLineNo: null, content: '  color-scheme: light;' },
      { type: 'remove', oldLineNo: 11, newLineNo: null, content: '}' },
      { type: 'remove', oldLineNo: 12, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 13, newLineNo: null, content: '@media (prefers-color-scheme: dark) {' },
      { type: 'remove', oldLineNo: 14, newLineNo: null, content: '  :root {' },
      { type: 'remove', oldLineNo: 15, newLineNo: null, content: '    --bg: #0a0a0a;' },
      { type: 'remove', oldLineNo: 16, newLineNo: null, content: '    --text: #fafafa;' },
      { type: 'remove', oldLineNo: 17, newLineNo: null, content: '    --muted: #a3a3a3;' },
      { type: 'remove', oldLineNo: 18, newLineNo: null, content: '    --border: #262626;' },
      { type: 'remove', oldLineNo: 19, newLineNo: null, content: '  }' },
      { type: 'remove', oldLineNo: 20, newLineNo: null, content: '}' },
      { type: 'add', oldLineNo: null, newLineNo: 4, content: '' },
      { type: 'add', oldLineNo: null, newLineNo: 5, content: '  /* Monochrome dark theme */' },
      { type: 'add', oldLineNo: null, newLineNo: 6, content: '  --bg: #0a0a0a;' },
      { type: 'add', oldLineNo: null, newLineNo: 7, content: '  --text: #e5e5e5;' },
      { type: 'add', oldLineNo: null, newLineNo: 8, content: '  --muted: #a3a3a3;' },
      { type: 'add', oldLineNo: null, newLineNo: 9, content: '  --border: #262626;' },
      { type: 'add', oldLineNo: null, newLineNo: 10, content: '' },
      { type: 'add', oldLineNo: null, newLineNo: 11, content: '  color-scheme: dark;' },
      { type: 'add', oldLineNo: null, newLineNo: 12, content: '}' },
    ],
  },
  {
    path: 'src/app.css',
    status: 'D',
    oldPath: 'src/app.css',
    additions: 0,
    deletions: 45,
    lines: [
      { type: 'remove', oldLineNo: 1, newLineNo: null, content: '.app {' },
      { type: 'remove', oldLineNo: 2, newLineNo: null, content: '  display: grid;' },
      { type: 'remove', oldLineNo: 3, newLineNo: null, content: '  grid-template-columns: 260px 1fr;' },
      { type: 'remove', oldLineNo: 4, newLineNo: null, content: '  grid-template-rows: 48px 1fr;' },
      { type: 'remove', oldLineNo: 5, newLineNo: null, content: '  height: 100vh;' },
      { type: 'remove', oldLineNo: 6, newLineNo: null, content: '}' },
      { type: 'remove', oldLineNo: 7, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 8, newLineNo: null, content: '.header {' },
      { type: 'remove', oldLineNo: 9, newLineNo: null, content: '  grid-column: 1 / -1;' },
      { type: 'remove', oldLineNo: 10, newLineNo: null, content: '  border-bottom: 1px solid var(--border);' },
      { type: 'remove', oldLineNo: 11, newLineNo: null, content: '  padding: 0 16px;' },
      { type: 'remove', oldLineNo: 12, newLineNo: null, content: '  display: flex;' },
      { type: 'remove', oldLineNo: 13, newLineNo: null, content: '  align-items: center;' },
      { type: 'remove', oldLineNo: 14, newLineNo: null, content: '  gap: 16px;' },
      { type: 'remove', oldLineNo: 15, newLineNo: null, content: '}' },
      { type: 'remove', oldLineNo: 16, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 17, newLineNo: null, content: '.sidebar {' },
      { type: 'remove', oldLineNo: 18, newLineNo: null, content: '  border-right: 1px solid var(--border);' },
      { type: 'remove', oldLineNo: 19, newLineNo: null, content: '  overflow-y: auto;' },
      { type: 'remove', oldLineNo: 20, newLineNo: null, content: '  padding: 16px 0;' },
      { type: 'remove', oldLineNo: 21, newLineNo: null, content: '}' },
      { type: 'remove', oldLineNo: 22, newLineNo: null, content: '' },
      { type: 'remove', oldLineNo: 23, newLineNo: null, content: '.main {' },
      { type: 'remove', oldLineNo: 24, newLineNo: null, content: '  overflow: auto;' },
      { type: 'remove', oldLineNo: 25, newLineNo: null, content: '  padding: 24px;' },
      { type: 'remove', oldLineNo: 26, newLineNo: null, content: '}' },
    ],
  },
];
