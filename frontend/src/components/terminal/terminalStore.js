/** Module-level terminal UI state — survives dock hide/show. */

let nextLocalId = 1;
let nextLayoutId = 1;

/** @typedef {{ localId: string, sessionId: string | null, cwd: string | null, title: string }} TerminalPane */

/** @typedef {{ layoutId: string, paneIds: string[], splitRatio: number }} TerminalLayout */

/** @type {TerminalPane[]} */
let panes = [];

/** @type {TerminalLayout[]} */
let layouts = [];

/** @type {string | null} */
let activeLayoutId = null;

/** @type {string | null} */
let activeLocalId = null;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

function getActiveLayout() {
  return layouts.find((l) => l.layoutId === activeLayoutId) ?? null;
}

export function subscribeTerminalStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTerminalStoreSnapshot() {
  const active = getActiveLayout();
  return {
    panes: panes.slice(),
    layouts: layouts.map((l) => ({
      layoutId: l.layoutId,
      paneIds: l.paneIds.slice(),
      splitRatio: l.splitRatio,
    })),
    activeLayoutId,
    activeLocalId,
    /** Visible pane ids for the active layout (empty if none). */
    splitLocalIds: active ? active.paneIds.slice() : [],
    splitRatio: active?.splitRatio ?? 0.5,
  };
}

/** Create a new single-pane layout tab and activate it. Returns the new pane's localId. */
export function createTabPlaceholder(title = 'Terminal') {
  const localId = `local-${nextLocalId++}`;
  const layoutId = `layout-${nextLayoutId++}`;
  panes = [...panes, { localId, sessionId: null, cwd: null, title }];
  layouts = [...layouts, { layoutId, paneIds: [localId], splitRatio: 0.5 }];
  activeLayoutId = layoutId;
  activeLocalId = localId;
  notify();
  return localId;
}

export function bindSession(localId, sessionId, cwd) {
  panes = panes.map((p) =>
    p.localId === localId
      ? { ...p, sessionId, cwd: cwd ?? p.cwd, title: cwd ? cwd.split('/').pop() || p.title : p.title }
      : p
  );
  notify();
}

/** Update pane cwd/title from shell OSC sequences (directory change). */
export function updatePaneCwdBySessionId(sessionId, cwd) {
  if (!sessionId || !cwd) return;
  const basename = cwd.replace(/\/+$/, '').split('/').pop() || cwd;
  let changed = false;
  panes = panes.map((p) => {
    if (p.sessionId !== sessionId) return p;
    if (p.cwd === cwd && p.title === basename) return p;
    changed = true;
    return { ...p, cwd, title: basename };
  });
  if (changed) notify();
}

/** Update pane title from OSC 0/2 when the title looks like a path/cwd. */
export function updatePaneTitleBySessionId(sessionId, rawTitle) {
  if (!sessionId || !rawTitle) return;
  let title = rawTitle.trim();
  if (!title) return;
  // Common forms: "/path/to/dir", "~/foo", "user@host: /path", "user@host:~/foo"
  const afterColon = title.includes(':') ? title.replace(/^[^:]+:\s*/, '') : title;
  const pathLike = afterColon.startsWith('/') || afterColon.startsWith('~') || afterColon.includes('/');
  if (!pathLike) return;
  const normalized = afterColon.replace(/^~/, '').replace(/\/+$/, '');
  title = normalized.split('/').filter(Boolean).pop() || afterColon;
  let changed = false;
  panes = panes.map((p) => {
    if (p.sessionId !== sessionId) return p;
    if (p.title === title) return p;
    changed = true;
    return { ...p, title };
  });
  if (changed) notify();
}

/** Focus a pane within its layout (does not switch layouts unless pane is elsewhere). */
export function setActivePane(localId) {
  const pane = panes.find((p) => p.localId === localId);
  if (!pane) return;
  const owner = layouts.find((l) => l.paneIds.includes(localId));
  if (!owner) return;
  if (owner.layoutId !== activeLayoutId) {
    activeLayoutId = owner.layoutId;
  }
  activeLocalId = localId;
  notify();
}

/** Activate a layout tab; focus last active pane if still in layout, else first pane. */
export function setActiveLayout(layoutId) {
  const layout = layouts.find((l) => l.layoutId === layoutId);
  if (!layout) return;
  activeLayoutId = layoutId;
  if (!layout.paneIds.includes(activeLocalId)) {
    activeLocalId = layout.paneIds[0] ?? null;
  }
  notify();
}

/** Add a pane to the right of the focused pane in the active layout. */
export function splitRight() {
  const layout = getActiveLayout();
  if (!layout) return null;
  const localId = `local-${nextLocalId++}`;
  panes = [...panes, { localId, sessionId: null, cwd: null, title: 'Terminal' }];
  const activeIdx = layout.paneIds.indexOf(activeLocalId);
  const insertAt = activeIdx >= 0 ? activeIdx + 1 : layout.paneIds.length;
  const paneIds = [...layout.paneIds.slice(0, insertAt), localId, ...layout.paneIds.slice(insertAt)];
  layouts = layouts.map((l) => (l.layoutId === layout.layoutId ? { ...l, paneIds } : l));
  activeLocalId = localId;
  notify();
  return localId;
}

export function setSplitRatio(ratio) {
  const layout = getActiveLayout();
  if (!layout) return;
  const splitRatio = Math.min(0.8, Math.max(0.2, ratio));
  layouts = layouts.map((l) => (l.layoutId === layout.layoutId ? { ...l, splitRatio } : l));
  notify();
}

/**
 * Remove an entire layout and all its panes.
 * @returns {string[]} sessionIds that were bound (caller should stop PTYs)
 */
export function removeLayout(layoutId) {
  const layout = layouts.find((l) => l.layoutId === layoutId);
  if (!layout) return [];
  const sessionIds = layout.paneIds
    .map((id) => panes.find((p) => p.localId === id)?.sessionId)
    .filter(Boolean);
  panes = panes.filter((p) => !layout.paneIds.includes(p.localId));
  layouts = layouts.filter((l) => l.layoutId !== layoutId);
  if (activeLayoutId === layoutId) {
    const next = layouts[0] ?? null;
    activeLayoutId = next?.layoutId ?? null;
    activeLocalId = next?.paneIds[0] ?? null;
  }
  notify();
  return sessionIds;
}

/**
 * Remove a single pane (e.g. shell exit). Drops empty layouts.
 * @returns {{ sessionId: string | null, layoutsRemaining: number }}
 */
function removePane(localId) {
  const pane = panes.find((p) => p.localId === localId);
  const sessionId = pane?.sessionId ?? null;
  panes = panes.filter((p) => p.localId !== localId);
  layouts = layouts
    .map((l) => ({ ...l, paneIds: l.paneIds.filter((id) => id !== localId) }))
    .filter((l) => l.paneIds.length > 0);

  if (!layouts.some((l) => l.layoutId === activeLayoutId)) {
    activeLayoutId = layouts[0]?.layoutId ?? null;
  }
  const active = getActiveLayout();
  if (!active || !active.paneIds.includes(activeLocalId)) {
    activeLocalId = active?.paneIds[0] ?? null;
  }
  notify();
  return { sessionId, layoutsRemaining: layouts.length };
}

export function removePaneBySessionId(sessionId) {
  const pane = panes.find((p) => p.sessionId === sessionId);
  if (!pane) return { sessionId: null, layoutsRemaining: layouts.length };
  return removePane(pane.localId);
}

export function hasTabs() {
  return layouts.length > 0;
}

/** Layout title for the tab bar: pane titles joined with middot. */
export function layoutTitle(layout) {
  const titles = layout.paneIds.map((id) => {
    const p = panes.find((x) => x.localId === id);
    return p?.title || 'Terminal';
  });
  return titles.join(' · ') || 'Terminal';
}
