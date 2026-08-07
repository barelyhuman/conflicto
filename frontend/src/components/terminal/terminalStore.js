/** Module-level terminal UI state — survives dock hide/show. */

let nextLocalId = 1;

/** @typedef {{ localId: string, sessionId: string | null, cwd: string | null, title: string }} TerminalTab */

/** @type {TerminalTab[]} */
let tabs = [];

/** @type {string | null} */
let activeLocalId = null;

/** Horizontal split: array of localIds visible side-by-side (subset of tabs). */
/** @type {string[]} */
let splitLocalIds = [];

/** Split ratio 0–1 for first pane width when two panes shown. */
let splitRatio = 0.5;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeTerminalStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTerminalStoreSnapshot() {
  return {
    tabs: tabs.slice(),
    activeLocalId,
    splitLocalIds: splitLocalIds.slice(),
    splitRatio,
  };
}

export function createTabPlaceholder(title = 'Terminal') {
  const localId = `local-${nextLocalId++}`;
  const tab = { localId, sessionId: null, cwd: null, title };
  tabs = [...tabs, tab];
  activeLocalId = localId;
  if (splitLocalIds.length <= 1) {
    splitLocalIds = [localId];
  }
  notify();
  return localId;
}

export function bindSession(localId, sessionId, cwd) {
  tabs = tabs.map((t) =>
    t.localId === localId
      ? { ...t, sessionId, cwd: cwd ?? t.cwd, title: cwd ? cwd.split('/').pop() || t.title : t.title }
      : t
  );
  notify();
}

export function setActiveTab(localId) {
  if (!tabs.some((t) => t.localId === localId)) return;
  activeLocalId = localId;
  if (!splitLocalIds.includes(localId)) {
    // Show this tab in the primary split slot
    if (splitLocalIds.length <= 1) {
      splitLocalIds = [localId];
    } else {
      splitLocalIds = [localId, splitLocalIds[1]].filter(Boolean);
    }
  }
  notify();
}

export function splitRight() {
  const active = tabs.find((t) => t.localId === activeLocalId);
  if (!active) return null;
  const localId = `local-${nextLocalId++}`;
  const tab = { localId, sessionId: null, cwd: null, title: 'Terminal' };
  tabs = [...tabs, tab];
  splitLocalIds = [active.localId, localId];
  activeLocalId = localId;
  notify();
  return localId;
}

export function setSplitRatio(ratio) {
  splitRatio = Math.min(0.8, Math.max(0.2, ratio));
  notify();
}

export function removeTab(localId) {
  const tab = tabs.find((t) => t.localId === localId);
  tabs = tabs.filter((t) => t.localId !== localId);
  splitLocalIds = splitLocalIds.filter((id) => id !== localId);
  if (splitLocalIds.length === 0 && tabs.length > 0) {
    splitLocalIds = [tabs[0].localId];
  }
  if (activeLocalId === localId) {
    activeLocalId = splitLocalIds[0] ?? tabs[0]?.localId ?? null;
  }
  notify();
  return tab?.sessionId ?? null;
}

export function removeTabBySessionId(sessionId) {
  const tab = tabs.find((t) => t.sessionId === sessionId);
  if (!tab) return;
  removeTab(tab.localId);
}

export function hasTabs() {
  return tabs.length > 0;
}
