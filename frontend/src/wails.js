// Wails runtime wrapper with fallback to mock data for development

import { stagedFiles, unstagedFiles, conflictFiles, pullRequests, localBranches, remoteBranches } from './mockData.js';
import { mockErrors } from './mockErrors.js';

// Check if we're running in Wails
const isWails = typeof window !== 'undefined' && window.go && window.go.main && window.go.main.App;

// Terminal event fan-out (panes subscribe via api.onTerminalData/Exit)
const terminalDataListeners = new Set();
const terminalExitListeners = new Set();

/** @type {Record<string, Function>|null} */
let mockEventCallbacks = null;

function emitTerminalData(data) {
  terminalDataListeners.forEach((fn) => {
    try {
      fn(data);
    } catch {
      // ignore listener errors
    }
  });
}

function emitTerminalExit(data) {
  terminalExitListeners.forEach((fn) => {
    try {
      fn(data);
    } catch {
      // ignore listener errors
    }
  });
}

export function setupWailsEvents(callbacks) {
  if (isWails && window.runtime) {
    // Subscribe to Wails events
    window.runtime.EventsOn('fileStatusChanged', (data) => {
      callbacks.onFileStatusChanged?.(data);
    });
    window.runtime.EventsOn('branchChanged', (data) => {
      callbacks.onBranchChanged?.(data);
    });
    window.runtime.EventsOn('aheadBehindUpdated', (data) => {
      callbacks.onAheadBehindUpdated?.(data);
    });
    window.runtime.EventsOn('diffLoaded', (data) => {
      callbacks.onDiffLoaded?.(data);
    });
    window.runtime.EventsOn('ghStatusChanged', (data) => {
      callbacks.onGHStatusChanged?.(data);
    });
    window.runtime.EventsOn('prListUpdated', (data) => {
      callbacks.onPRListUpdated?.(data);
    });
    window.runtime.EventsOn('prFilesUpdated', (data) => {
      callbacks.onPRFilesUpdated?.(data);
    });
    window.runtime.EventsOn('prCommentsUpdated', (data) => {
      callbacks.onPRCommentsUpdated?.(data);
    });
    window.runtime.EventsOn('prCommentPosted', (data) => {
      callbacks.onPRCommentPosted?.(data);
    });
    window.runtime.EventsOn('prCheckoutCompleted', (data) => {
      callbacks.onPRCheckoutCompleted?.(data);
    });
    window.runtime.EventsOn('prCreated', (data) => {
      callbacks.onPRCreated?.(data);
    });
    window.runtime.EventsOn('error', (data) => {
      callbacks.onError?.(data);
    });
    window.runtime.EventsOn('openPreferences', () => {
      callbacks.onOpenPreferences?.();
    });
    window.runtime.EventsOn('projectChanged', (data) => {
      callbacks.onProjectChanged?.(data);
    });
    window.runtime.EventsOn('recentProjectsUpdated', (data) => {
      callbacks.onRecentProjectsUpdated?.(data);
    });
    window.runtime.EventsOn('platformInfo', (data) => {
      callbacks.onPlatformInfo?.(data);
    });
    window.runtime.EventsOn('refreshCompleted', () => {
      callbacks.onRefreshCompleted?.();
    });
    window.runtime.EventsOn('terminal:data', (data) => {
      emitTerminalData(data);
      callbacks.onTerminalData?.(data);
    });
    window.runtime.EventsOn('terminal:exit', (data) => {
      emitTerminalExit(data);
      callbacks.onTerminalExit?.(data);
    });

    // Request initial data via the public Refresh method
    // (private Go methods like emitFileStatus are not bound to JS)
    window.go.main.App.Refresh();
  } else {
    mockEventCallbacks = callbacks;
    // Development fallback: emit mock data after a short delay
    setTimeout(() => {
      callbacks.onFileStatusChanged?.({
        staged: stagedFiles,
        unstaged: unstagedFiles,
        conflicts: conflictFiles,
      });
      callbacks.onBranchChanged?.({
        current: 'main',
        local: localBranches,
        remote: remoteBranches,
      });
      callbacks.onAheadBehindUpdated?.({ ahead: 1, behind: 2 });
      callbacks.onGHStatusChanged?.({
        installed: true,
        version: '2.40.1',
        user: '@sid',
      });
      callbacks.onPRListUpdated?.({
        prs: pullRequests.map((pr) => ({
          number: pr.number,
          title: pr.title,
          author: pr.author,
          baseBranch: pr.baseBranch,
        })),
      });
      callbacks.onProjectChanged?.({
        name: 'conflicto',
        path: '/Users/sid/dev/conflicto',
      });
      callbacks.onRecentProjectsUpdated?.({
        projects: [
          { name: 'conflicto', path: '/Users/sid/dev/conflicto', openedAt: new Date().toISOString() },
          { name: 'dotfiles', path: '/Users/sid/dotfiles', openedAt: new Date(Date.now() - 86400000).toISOString() },
        ],
      });
      callbacks.onPlatformInfo?.({ platform: 'darwin' });
    }, 100);
  }
}

// API methods
export const api = {
  stageFile: (path) => {
    if (isWails) {
      return window.go.main.App.StageFile(path);
    }
    // Mock: move from unstaged to staged
    return Promise.resolve();
  },

  unstageFile: (path) => {
    if (isWails) {
      return window.go.main.App.UnstageFile(path);
    }
    // Mock: move from staged to unstaged
    return Promise.resolve();
  },

  discardFile: (path) => {
    if (isWails) {
      return window.go.main.App.DiscardFile(path);
    }
    return Promise.resolve();
  },

  commit: (message) => {
    if (isWails) {
      return window.go.main.App.Commit(message);
    }
    return Promise.resolve();
  },

  switchBranch: (name) => {
    if (isWails) {
      return window.go.main.App.SwitchBranch(name);
    }
    return Promise.resolve();
  },

  getDiff: (path, staged = false) => {
    if (isWails) {
      return window.go.main.App.GetDiff(path, !!staged);
    }
    // Mock: return a simple diff for dev mode
    const mockPatch = `diff --git a/${path} b/${path}
index 1234567..abcdefg 100644
--- a/${path}
+++ b/${path}
@@ -1,5 +1,5 @@
 context line 1
 context line 2
-old line
+new line
 context line 4
 context line 5
`;
    const data = {
      path,
      patch: mockPatch,
      lines: [
        { type: 'context', oldLineNo: 1, newLineNo: 1, content: 'context line 1' },
        { type: 'context', oldLineNo: 2, newLineNo: 2, content: 'context line 2' },
        { type: 'remove', oldLineNo: 3, newLineNo: null, content: 'old line' },
        { type: 'add', oldLineNo: null, newLineNo: 3, content: 'new line' },
        { type: 'context', oldLineNo: 4, newLineNo: 4, content: 'context line 4' },
        { type: 'context', oldLineNo: 5, newLineNo: 5, content: 'context line 5' },
      ],
      additions: 1,
      deletions: 1,
      status: 'M',
    };
    mockEventCallbacks?.onDiffLoaded?.(data);
    return Promise.resolve(data);
  },

  pull: () => {
    if (isWails) {
      return window.go.main.App.Pull();
    }
    // Mock: random error
    const err = mockErrors[Math.floor(Math.random() * mockErrors.length)];
    return Promise.reject(err);
  },

  push: () => {
    if (isWails) {
      return window.go.main.App.Push();
    }
    // Mock: random error
    const err = mockErrors[Math.floor(Math.random() * mockErrors.length)];
    return Promise.reject(err);
  },

  fetch: () => {
    if (isWails) {
      return window.go.main.App.Fetch();
    }
    return Promise.resolve();
  },

  detectGH: () => {
    if (isWails) {
      return window.go.main.App.DetectGH();
    }
    return Promise.resolve();
  },

  getPRList: () => {
    if (isWails) {
      return window.go.main.App.GetPRList();
    }
    return Promise.resolve();
  },

  searchPRList: (limit, search) => {
    if (isWails) {
      return window.go.main.App.SearchPRList(limit, search);
    }
    const filtered = search
      ? pullRequests.filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) ||
            String(p.number).includes(search)
        )
      : [...pullRequests];
    return Promise.resolve(
      filtered.slice(0, limit).map((p) => ({
        number: p.number,
        title: p.title,
        author: p.author,
        baseBranch: p.baseBranch,
      }))
    );
  },

  getPRFiles: (number) => {
    if (isWails) {
      return window.go.main.App.GetPRFiles(number);
    }
    return Promise.resolve();
  },

  getPRFileDiff: (number, path) => {
    if (isWails) {
      return window.go.main.App.GetPRFileDiff(number, path);
    }
    // Mock: return a simple diff for dev mode
    const mockPatch = `diff --git a/${path} b/${path}
index 1234567..abcdefg 100644
--- a/${path}
+++ b/${path}
@@ -1,5 +1,5 @@
 context line 1
 context line 2
-old line
+new line
 context line 4
 context line 5
`;
    return Promise.resolve({
      path,
      patch: mockPatch,
      lines: [
        { type: 'context', oldLineNo: 1, newLineNo: 1, content: 'context line 1' },
        { type: 'context', oldLineNo: 2, newLineNo: 2, content: 'context line 2' },
        { type: 'remove', oldLineNo: 3, newLineNo: null, content: 'old line' },
        { type: 'add', oldLineNo: null, newLineNo: 3, content: 'new line' },
        { type: 'context', oldLineNo: 4, newLineNo: 4, content: 'context line 4' },
        { type: 'context', oldLineNo: 5, newLineNo: 5, content: 'context line 5' },
      ],
      additions: 1,
      deletions: 1,
      status: 'M',
    });
  },

  getPRComments: (number) => {
    if (isWails) {
      return window.go.main.App.GetPRComments(number);
    }
    return Promise.resolve();
  },

  postPRComment: (number, path, body, line, side, startLine, startSide) => {
    if (isWails) {
      return window.go.main.App.PostPRComment(number, path, body, line, side, startLine, startSide);
    }
    return Promise.resolve();
  },

  checkoutPR: (number) => {
    if (isWails) {
      return window.go.main.App.CheckoutPR(number);
    }
    return Promise.resolve();
  },

  checkoutPRToWorktree: (number) => {
    if (isWails) {
      return window.go.main.App.CheckoutPRToWorktree(number);
    }
    return Promise.resolve();
  },

  createPR: (title, body, baseBranch, draft) => {
    if (isWails) {
      return window.go.main.App.CreatePR(title, body, baseBranch, draft);
    }
    return Promise.resolve();
  },

  openProject: () => {
    if (isWails) {
      return window.go.main.App.OpenProject();
    }
    return Promise.resolve('/Users/sid/dev/conflicto');
  },

  switchProject: (path) => {
    if (isWails) {
      return window.go.main.App.SwitchProject(path);
    }
    return Promise.resolve();
  },

  getRecentProjects: () => {
    if (isWails) {
      return window.go.main.App.GetRecentProjects();
    }
    return Promise.resolve([
      { name: 'conflicto', path: '/Users/sid/dev/conflicto', openedAt: new Date().toISOString() },
      { name: 'dotfiles', path: '/Users/sid/dotfiles', openedAt: new Date(Date.now() - 86400000).toISOString() },
    ]);
  },

  getCurrentProject: () => {
    if (isWails) {
      return window.go.main.App.GetCurrentProject();
    }
    return Promise.resolve({ name: 'conflicto', path: '/Users/sid/dev/conflicto' });
  },

  terminalStart: (opts = {}) => {
    if (isWails) {
      return window.go.main.App.TerminalStart(opts);
    }
    // Dev mock: fake session id, no real PTY
    const id = `mock-${Date.now()}`;
    setTimeout(() => {
      emitTerminalData({ id, data: `\r\n[dev] mock terminal ${id}\r\n$ ` });
    }, 50);
    return Promise.resolve({ id, cwd: opts.cwd || '/Users/sid/dev/conflicto' });
  },

  terminalWrite: (id, data) => {
    if (isWails) {
      return window.go.main.App.TerminalWrite(id, data);
    }
    if (data === '\r' || data === '\n') {
      emitTerminalData({ id, data: '\r\n$ ' });
    } else if (data === '\x1b\r') {
      emitTerminalData({ id, data: '\r\n' });
    } else {
      emitTerminalData({ id, data });
    }
    return Promise.resolve();
  },

  terminalResize: (id, cols, rows) => {
    if (isWails) {
      return window.go.main.App.TerminalResize(id, cols, rows);
    }
    return Promise.resolve();
  },

  terminalStop: (id) => {
    if (isWails) {
      return window.go.main.App.TerminalStop(id);
    }
    setTimeout(() => {
      emitTerminalExit({ id, code: 0 });
    }, 0);
    return Promise.resolve();
  },

  getTerminalPrefs: () => {
    if (isWails) {
      return window.go.main.App.GetTerminalPrefs();
    }
    try {
      const raw = localStorage.getItem('conflicto.terminalPrefs');
      if (raw) return Promise.resolve(JSON.parse(raw));
    } catch {
      // ignore
    }
    return Promise.resolve({ terminalOpen: false, terminalHeight: 220 });
  },

  setTerminalPrefs: (open, height) => {
    if (isWails) {
      return window.go.main.App.SetTerminalPrefs(open, height);
    }
    try {
      localStorage.setItem(
        'conflicto.terminalPrefs',
        JSON.stringify({ terminalOpen: open, terminalHeight: height })
      );
    } catch {
      // ignore
    }
    return Promise.resolve();
  },

  onTerminalData: (fn) => {
    terminalDataListeners.add(fn);
    return () => terminalDataListeners.delete(fn);
  },

  onTerminalExit: (fn) => {
    terminalExitListeners.add(fn);
    return () => terminalExitListeners.delete(fn);
  },
};

// Window / Environment helpers
export async function getEnvironment() {
  if (isWails && window.runtime) {
    return window.runtime.Environment();
  }
  return { platform: 'darwin', buildType: 'dev', arch: 'arm64' };
}

export async function isFullscreen() {
  if (isWails && window.runtime) {
    return window.runtime.WindowIsFullscreen();
  }
  return false;
}

export function watchFullscreen(callback, intervalMs = 500) {
  if (!isWails || !window.runtime) {
    return () => {};
  }
  let last = false;
  const id = setInterval(async () => {
    const current = await window.runtime.WindowIsFullscreen();
    if (current !== last) {
      last = current;
      callback(current);
    }
  }, intervalMs);
  return () => clearInterval(id);
}

export { isWails, emitTerminalData, emitTerminalExit };
