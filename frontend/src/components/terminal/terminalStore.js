/** Module-level terminal UI state — survives dock hide/show.
 *
 * Scoped per project/worktree path (a worktree switch is a project switch in
 * this app, so the absolute path covers both). Switching scopes swaps the
 * visible tabs/panes; other scopes' panes stay in the snapshot so their dock
 * slots never unmount and PTYs, output, and scrollback survive. */

let nextLocalId = 1;
let nextLayoutId = 1;

/** @typedef {{ localId: string, sessionId: string | null, scopePath: string | null, cwd: string | null, title: string }} TerminalPane */

/** @typedef {{ layoutId: string, paneIds: string[], splitRatio: number }} TerminalLayout */

/** @typedef {{ panes: TerminalPane[], layouts: TerminalLayout[], activeLayoutId: string | null, activeLocalId: string | null }} TerminalScope */

/** @type {Map<string | null, TerminalScope>} Key: project path (null = no project yet). */
const scopes = new Map();

/** @type {string | null} */
let currentScopePath = null;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

function scopeKey(path) {
  return path || null;
}

function newScope() {
  return { panes: [], layouts: [], activeLayoutId: null, activeLocalId: null };
}

/** Current scope, created on demand (mutators need a place to write). */
function currentScope() {
  let scope = scopes.get(currentScopePath);
  if (!scope) {
    scope = newScope();
    scopes.set(currentScopePath, scope);
  }
  return scope;
}

function getActiveLayoutOf(scope) {
  return scope.layouts.find((l) => l.layoutId === scope.activeLayoutId) ?? null;
}

function scopeHasTabs(key) {
  return (scopes.get(key)?.layouts.length ?? 0) > 0;
}

/** Find a pane anywhere (any scope) matching pred, with its owning scope. */
function findPane(pred) {
  for (const [key, scope] of scopes) {
    const pane = scope.panes.find(pred);
    if (pane) return { key, scope, pane };
  }
  return null;
}

function pruneScopeIfEmpty(key) {
  const scope = scopes.get(key);
  if (scope && scope.panes.length === 0 && scope.layouts.length === 0) {
    scopes.delete(key);
  }
}

export function subscribeTerminalStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTerminalStoreSnapshot() {
  const scope = scopes.get(currentScopePath) ?? newScope();
  const active = getActiveLayoutOf(scope);
  const panes = [];
  for (const s of scopes.values()) {
    for (const p of s.panes) panes.push(p);
  }
  return {
    /** Panes across ALL scopes so every dock slot stays mounted; non-visible slots park via CSS. */
    panes,
    /** Tabs of the CURRENT scope only. */
    layouts: scope.layouts.map((l) => ({
      layoutId: l.layoutId,
      paneIds: l.paneIds.slice(),
      splitRatio: l.splitRatio,
    })),
    activeLayoutId: scope.activeLayoutId,
    activeLocalId: scope.activeLocalId,
    /** Visible pane ids for the active layout (empty if none). */
    splitLocalIds: active ? active.paneIds.slice() : [],
    splitRatio: active?.splitRatio ?? 0.5,
  };
}

/**
 * Switch the active terminal scope (project/worktree path). Idempotent —
 * re-setting the current path preserves all pane state. Panes created before
 * the first project event (null scope, e.g. dock bootstraps at launch) are
 * adopted into the first real scope.
 * @param {string | null | undefined} path
 * @returns {boolean} whether the target scope already had tabs
 */
export function setTerminalScope(path) {
  const key = scopeKey(path);
  if (key === currentScopePath) return scopeHasTabs(key);
  if (!scopes.has(key)) {
    const orphan = currentScopePath === null && key !== null ? scopes.get(null) : null;
    if (orphan && orphan.layouts.length > 0) {
      scopes.delete(null);
      scopes.set(key, {
        ...orphan,
        panes: orphan.panes.map((p) => ({ ...p, scopePath: key })),
      });
    } else {
      scopes.set(key, newScope());
    }
  }
  currentScopePath = key;
  notify();
  return scopeHasTabs(key);
}

/**
 * Drop an entire scope (e.g. its worktree was removed). Does not stop PTYs —
 * the caller owns that via the returned session ids.
 * @returns {string[]} sessionIds that were bound (caller should stop PTYs)
 */
export function removeTerminalScope(path) {
  const key = scopeKey(path);
  const scope = scopes.get(key);
  if (!scope) return [];
  const sessionIds = scope.panes.map((p) => p.sessionId).filter(Boolean);
  scopes.delete(key);
  if (currentScopePath === key) {
    currentScopePath = null;
  }
  notify();
  return sessionIds;
}

/** Create a new single-pane layout tab in the current scope and activate it. Returns the new pane's localId. */
export function createTabPlaceholder(title = 'Terminal') {
  const scope = currentScope();
  const localId = `local-${nextLocalId++}`;
  const layoutId = `layout-${nextLayoutId++}`;
  scope.panes = [...scope.panes, { localId, sessionId: null, scopePath: currentScopePath, cwd: null, title }];
  scope.layouts = [...scope.layouts, { layoutId, paneIds: [localId], splitRatio: 0.5 }];
  scope.activeLayoutId = layoutId;
  scope.activeLocalId = localId;
  notify();
  return localId;
}

/** Bind a PTY session to a pane in any scope (sessions may spawn for background panes). */
export function bindSession(localId, sessionId, cwd) {
  const found = findPane((p) => p.localId === localId);
  if (!found) return;
  const { scope } = found;
  scope.panes = scope.panes.map((p) =>
    p.localId === localId
      ? { ...p, sessionId, cwd: cwd ?? p.cwd, title: cwd ? cwd.split('/').pop() || p.title : p.title }
      : p
  );
  notify();
}

/** Replace panes bound to a session (in any scope) via updater; notifies on change. */
function updatePaneBySessionId(sessionId, updater) {
  let changed = false;
  for (const scope of scopes.values()) {
    let scopeChanged = false;
    const panes = scope.panes.map((p) => {
      if (p.sessionId !== sessionId) return p;
      const next = updater(p);
      if (next === p) return p;
      scopeChanged = true;
      return next;
    });
    if (scopeChanged) {
      scope.panes = panes;
      changed = true;
    }
  }
  if (changed) notify();
}

/** Update pane cwd/title from shell OSC sequences (directory change). */
export function updatePaneCwdBySessionId(sessionId, cwd) {
  if (!sessionId || !cwd) return;
  const basename = cwd.replace(/\/+$/, '').split('/').pop() || cwd;
  updatePaneBySessionId(sessionId, (p) =>
    p.cwd === cwd && p.title === basename ? p : { ...p, cwd, title: basename }
  );
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
  updatePaneBySessionId(sessionId, (p) => (p.title === title ? p : { ...p, title }));
}

/** Focus a pane within the current scope (does not switch layouts unless pane is elsewhere). */
export function setActivePane(localId) {
  const scope = currentScope();
  if (!scope.panes.some((p) => p.localId === localId)) return;
  const owner = scope.layouts.find((l) => l.paneIds.includes(localId));
  if (!owner) return;
  if (owner.layoutId !== scope.activeLayoutId) {
    scope.activeLayoutId = owner.layoutId;
  }
  scope.activeLocalId = localId;
  notify();
}

/** Activate a layout tab; focus last active pane if still in layout, else first pane. */
export function setActiveLayout(layoutId) {
  const scope = currentScope();
  const layout = scope.layouts.find((l) => l.layoutId === layoutId);
  if (!layout) return;
  scope.activeLayoutId = layoutId;
  if (!layout.paneIds.includes(scope.activeLocalId)) {
    scope.activeLocalId = layout.paneIds[0] ?? null;
  }
  notify();
}

/** Add a pane to the right of the focused pane in the active layout of the current scope. */
export function splitRight() {
  const scope = currentScope();
  const layout = getActiveLayoutOf(scope);
  if (!layout) return null;
  const localId = `local-${nextLocalId++}`;
  scope.panes = [...scope.panes, { localId, sessionId: null, scopePath: currentScopePath, cwd: null, title: 'Terminal' }];
  const activeIdx = layout.paneIds.indexOf(scope.activeLocalId);
  const insertAt = activeIdx >= 0 ? activeIdx + 1 : layout.paneIds.length;
  const paneIds = [...layout.paneIds.slice(0, insertAt), localId, ...layout.paneIds.slice(insertAt)];
  scope.layouts = scope.layouts.map((l) => (l.layoutId === layout.layoutId ? { ...l, paneIds } : l));
  scope.activeLocalId = localId;
  notify();
  return localId;
}

export function setSplitRatio(ratio) {
  const scope = currentScope();
  const layout = getActiveLayoutOf(scope);
  if (!layout) return;
  const splitRatio = Math.min(0.8, Math.max(0.2, ratio));
  scope.layouts = scope.layouts.map((l) => (l.layoutId === layout.layoutId ? { ...l, splitRatio } : l));
  notify();
}

/**
 * Remove an entire layout and all its panes from the current scope.
 * @returns {string[]} sessionIds that were bound (caller should stop PTYs)
 */
export function removeLayout(layoutId) {
  const scope = currentScope();
  const layout = scope.layouts.find((l) => l.layoutId === layoutId);
  if (!layout) return [];
  const sessionIds = layout.paneIds
    .map((id) => scope.panes.find((p) => p.localId === id)?.sessionId)
    .filter(Boolean);
  scope.panes = scope.panes.filter((p) => !layout.paneIds.includes(p.localId));
  scope.layouts = scope.layouts.filter((l) => l.layoutId !== layoutId);
  if (scope.activeLayoutId === layoutId) {
    const next = scope.layouts[0] ?? null;
    scope.activeLayoutId = next?.layoutId ?? null;
    scope.activeLocalId = next?.paneIds[0] ?? null;
  }
  pruneScopeIfEmpty(currentScopePath);
  notify();
  return sessionIds;
}

/**
 * Remove a single pane (e.g. shell exit) from whichever scope owns it.
 * Drops empty layouts; prunes the owning scope when it empties.
 * @returns {{ sessionId: string | null, layoutsRemaining: number }}
 */
function removePane(localId) {
  const found = findPane((p) => p.localId === localId);
  if (!found) return { sessionId: null, layoutsRemaining: 0 };
  const { key, scope, pane } = found;
  const sessionId = pane.sessionId ?? null;
  scope.panes = scope.panes.filter((p) => p.localId !== localId);
  scope.layouts = scope.layouts
    .map((l) => ({ ...l, paneIds: l.paneIds.filter((id) => id !== localId) }))
    .filter((l) => l.paneIds.length > 0);

  if (!scope.layouts.some((l) => l.layoutId === scope.activeLayoutId)) {
    scope.activeLayoutId = scope.layouts[0]?.layoutId ?? null;
  }
  const active = getActiveLayoutOf(scope);
  if (!active || !active.paneIds.includes(scope.activeLocalId)) {
    scope.activeLocalId = active?.paneIds[0] ?? null;
  }
  pruneScopeIfEmpty(key);
  notify();
  return { sessionId, layoutsRemaining: scope.layouts.length };
}

export function removePaneBySessionId(sessionId) {
  const found = findPane((p) => p.sessionId === sessionId);
  if (!found) return { sessionId: null, layoutsRemaining: 0 };
  return removePane(found.pane.localId);
}

/** Whether the CURRENT scope has any tabs. */
export function hasTabs() {
  return scopeHasTabs(currentScopePath);
}

/** Layout title for the tab bar: pane titles joined with middot. */
export function layoutTitle(layout) {
  const titles = layout.paneIds.map((id) => findPane((p) => p.localId === id)?.pane.title || 'Terminal');
  return titles.join(' · ') || 'Terminal';
}
