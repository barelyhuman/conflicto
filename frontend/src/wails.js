// Wails runtime wrapper

// Terminal event fan-out (panes subscribe via api.onTerminalData/Exit)
const terminalDataListeners = new Set();
const terminalExitListeners = new Set();

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
}

// API methods
export const api = {
  stageFile: (path) => window.go.main.App.StageFile(path),

  unstageFile: (path) => window.go.main.App.UnstageFile(path),

  discardFile: (path) => window.go.main.App.DiscardFile(path),

  commit: (message) => window.go.main.App.Commit(message),

  switchBranch: (name) => window.go.main.App.SwitchBranch(name),

  getDiff: (path, staged = false) => window.go.main.App.GetDiff(path, !!staged),

  pull: () => window.go.main.App.Pull(),

  push: () => window.go.main.App.Push(),

  fetch: () => window.go.main.App.Fetch(),

  detectGH: () => window.go.main.App.DetectGH(),

  getPRList: () => window.go.main.App.GetPRList(),

  searchPRList: (limit, search) => window.go.main.App.SearchPRList(limit, search),

  getPRFiles: (number) => window.go.main.App.GetPRFiles(number),

  getPRFileDiff: (number, path) => window.go.main.App.GetPRFileDiff(number, path),

  getPRComments: (number) => window.go.main.App.GetPRComments(number),

  postPRComment: (number, path, body, line, side, startLine, startSide) =>
    window.go.main.App.PostPRComment(number, path, body, line, side, startLine, startSide),

  checkoutPR: (number) => window.go.main.App.CheckoutPR(number),

  checkoutPRToWorktree: (number) => window.go.main.App.CheckoutPRToWorktree(number),

  createPR: (title, body, baseBranch, draft) =>
    window.go.main.App.CreatePR(title, body, baseBranch, draft),

  openProject: () => window.go.main.App.OpenProject(),

  switchProject: (path) => window.go.main.App.SwitchProject(path),

  getRecentProjects: () => window.go.main.App.GetRecentProjects(),

  getCurrentProject: () => window.go.main.App.GetCurrentProject(),

  terminalStart: (opts = {}) => window.go.main.App.TerminalStart(opts),

  terminalWrite: (id, data) => window.go.main.App.TerminalWrite(id, data),

  terminalResize: (id, cols, rows) => window.go.main.App.TerminalResize(id, cols, rows),

  terminalStop: (id) => window.go.main.App.TerminalStop(id),

  getTerminalPrefs: () => window.go.main.App.GetTerminalPrefs(),

  setTerminalPrefs: (open, height) => window.go.main.App.SetTerminalPrefs(open, height),

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
  return window.runtime.Environment();
}

export async function isFullscreen() {
  return window.runtime.WindowIsFullscreen();
}

export function watchFullscreen(callback, intervalMs = 500) {
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

export { emitTerminalData, emitTerminalExit };
