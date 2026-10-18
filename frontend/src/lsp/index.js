import { effect, signal } from '@preact/signals';
import { api } from '../wails.js';
import { tabsStore } from '../models/tabs.js';
import { getActiveView, getViewMeta } from '../models/editorRegistry.js';
import { openFileAt } from '../models/navigation.js';
import { showResults } from '../models/resultsPanel.js';
import { createSearchModel } from '../models/searchModel.js';
import { createLspSession } from './session.js';
import { createNavHistory } from './navHistory.js';
import { createCodeNav } from './codeNav.js';
import { createDiagnosticsBus } from './diagnostics.js';
import { offsetToPosition } from './positions.js';

/** Live singletons wired to the real backend. */

/** Short-lived message shown in the status pill ("Definition is outside the workspace"). */
export const notice = signal('');
let noticeTimer = null;

function notify(message) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = '';
  }, 4000);
}

export const diagnosticsBus = createDiagnosticsBus();

export const lspSession = createLspSession({
  api,
  onDiagnostics: (serverId, uri, diagnostics) => diagnosticsBus.publish(serverId, uri, diagnostics),
});

// Fresh workspace: diagnostics from the old servers are stale.
effect(() => {
  lspSession.epoch.value;
  diagnosticsBus.clear();
});

export const navHistory = createNavHistory();

/** Where the user is now (for the back stack). */
function getCurrent() {
  const tab = tabsStore.activeTab.peek();

  if (!tab) return null;

  if (tab.kind === 'file') {
    const view = getActiveView();

    if (view && getViewMeta(view)) {
      const pos = offsetToPosition(view.state.doc, view.state.selection.main.head);

      return { path: tab.path, line: pos.line + 1, col: pos.character + 1 };
    }
  }

  return { path: tab.path };
}

async function readLines(path) {
  try {
    const res = await api.getFileContents(path, false);

    return res?.hasNew ? res.newContent.split('\n') : null;
  } catch {
    return null;
  }
}

export const codeNav = createCodeNav({
  session: lspSession,
  searchText: (opts) => api.searchText(opts),
  openFileAt,
  history: navHistory,
  getCurrent,
  showResults,
  readLines,
  notify,
});

export const searchModel = createSearchModel({
  api,
  openFileAt: (path, line, col) => {
    const from = getCurrent();

    if (from) navHistory.push(from);

    return openFileAt(path, line, col);
  },
});

/** Called by the app on project change. */
export function resetLspForProject(path) {
  lspSession.reset(path ?? '');
  navHistory.clear();

  if (searchModel.query.peek()) searchModel.runNow();
  else searchModel.results.value = [];
}
