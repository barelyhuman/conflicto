import { beforeEach, describe, expect, it, vi } from 'vitest';

// The terminal store is module-level; re-import a fresh copy per test so
// scope state never leaks between cases.
let store;

beforeEach(async () => {
  vi.resetModules();
  store = await import('./terminalStore.js');
});

describe('terminalStore scoping', () => {
  it('creates tabs in the current scope', () => {
    store.setTerminalScope('/p1');
    const localId = store.createTabPlaceholder();

    const snap = store.getTerminalStoreSnapshot();
    expect(snap.layouts).toHaveLength(1);
    expect(snap.activeLocalId).toBe(localId);
    expect(store.hasTabs()).toBe(true);

    const pane = snap.panes.find((p) => p.localId === localId);
    expect(pane.scopePath).toBe('/p1');
  });

  it('bindSession titles the pane from the spawn cwd', () => {
    store.setTerminalScope('/repos/conflicto');
    const localId = store.createTabPlaceholder();
    store.bindSession(localId, 'term-1', '/repos/conflicto');

    const pane = store.getTerminalStoreSnapshot().panes.find((p) => p.localId === localId);
    expect(pane.sessionId).toBe('term-1');
    expect(pane.title).toBe('conflicto');
  });

  it('binds sessions for panes in background scopes', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.setTerminalScope('/p2');
    store.createTabPlaceholder();

    // The dock's panes-watcher can bind a background pane's pending session
    store.bindSession(a, 'term-9', '/p1');

    const pane = store.getTerminalStoreSnapshot().panes.find((p) => p.localId === a);
    expect(pane.sessionId).toBe('term-9');
    expect(pane.title).toBe('p1');
  });

  it('switching scopes swaps visible tabs but keeps other scopes mounted', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.bindSession(a, 'term-1', '/p1');

    store.setTerminalScope('/p2');
    let snap = store.getTerminalStoreSnapshot();
    expect(snap.layouts).toHaveLength(0);
    expect(snap.splitLocalIds).toHaveLength(0);
    expect(store.hasTabs()).toBe(false);
    // /p1 pane stays in the snapshot so its dock slot never unmounts
    expect(snap.panes.some((p) => p.localId === a)).toBe(true);

    store.setTerminalScope('/p1');
    snap = store.getTerminalStoreSnapshot();
    expect(snap.layouts).toHaveLength(1);
    expect(snap.activeLocalId).toBe(a);
    expect(snap.panes.find((p) => p.localId === a).sessionId).toBe('term-1');
  });

  it('re-setting the current scope is a no-op that preserves state', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    const listener = vi.fn();
    store.subscribeTerminalStore(listener);

    expect(store.setTerminalScope('/p1')).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    const snap = store.getTerminalStoreSnapshot();
    expect(snap.layouts).toHaveLength(1);
    expect(snap.activeLocalId).toBe(a);
  });

  it('mutators only touch the current scope', () => {
    store.setTerminalScope('/p1');
    store.createTabPlaceholder();

    store.setTerminalScope('/p2');
    const b1 = store.createTabPlaceholder();
    store.bindSession(b1, 'term-2', '/p2');
    const b2 = store.splitRight();

    const layout = store
      .getTerminalStoreSnapshot()
      .layouts.find((l) => l.paneIds.includes(b1));
    const sessionIds = store.removeLayout(layout.layoutId);
    expect(sessionIds).toEqual(['term-2']);
    expect(store.getTerminalStoreSnapshot().panes.some((p) => p.localId === b2)).toBe(false);

    store.setTerminalScope('/p1');
    expect(store.getTerminalStoreSnapshot().layouts).toHaveLength(1);
  });

  it('active pane and layout selection stay within the current scope', () => {
    store.setTerminalScope('/p1');
    store.createTabPlaceholder();
    const a2 = store.createTabPlaceholder();
    const p1LayoutId = store.getTerminalStoreSnapshot().activeLayoutId;
    store.setTerminalScope('/p2');
    const b1 = store.createTabPlaceholder();

    // Foreign ids are ignored — no cross-scope focus changes
    store.setActivePane(a2);
    store.setActiveLayout(p1LayoutId);
    let snap = store.getTerminalStoreSnapshot();
    expect(snap.activeLocalId).toBe(b1);
    expect(snap.activeLayoutId).toBe(snap.layouts[0].layoutId);

    // /p1 keeps its own active state untouched
    store.setTerminalScope('/p1');
    snap = store.getTerminalStoreSnapshot();
    expect(snap.activeLocalId).toBe(a2);
    expect(snap.activeLayoutId).toBe(p1LayoutId);
  });

  it('layoutTitle joins pane titles of the current scope layout', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.bindSession(a, 'term-1', '/p1/alpha');
    store.setTerminalScope('/p2');
    const b = store.createTabPlaceholder();
    store.bindSession(b, 'term-2', '/p2/beta');

    store.setTerminalScope('/p1');
    const layout = store.getTerminalStoreSnapshot().layouts[0];
    expect(store.layoutTitle(layout)).toBe('alpha');
  });

  it('session-keyed updates reach panes in background scopes', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.bindSession(a, 'term-1', '/p1');
    store.setTerminalScope('/p2');
    store.createTabPlaceholder();

    // OSC 7 / title events arrive for any live session, current scope or not
    store.updatePaneCwdBySessionId('term-1', '/p1/sub');
    store.updatePaneTitleBySessionId('term-1', '/p1/sub');

    const pane = store.getTerminalStoreSnapshot().panes.find((p) => p.localId === a);
    expect(pane.cwd).toBe('/p1/sub');
    expect(pane.title).toBe('sub');
  });

  it('shell exit removes the pane from its owning scope and prunes it', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.bindSession(a, 'term-1', '/p1');
    store.setTerminalScope('/p2');
    const b = store.createTabPlaceholder();
    store.bindSession(b, 'term-2', '/p2');

    const result = store.removePaneBySessionId('term-1');
    expect(result.sessionId).toBe('term-1');

    const snap = store.getTerminalStoreSnapshot();
    expect(snap.panes.some((p) => p.localId === a)).toBe(false);
    expect(snap.panes.some((p) => p.localId === b)).toBe(true);

    store.setTerminalScope('/p1');
    expect(store.hasTabs()).toBe(false);
  });

  it('removeTerminalScope returns bound session ids and only drops that scope', () => {
    store.setTerminalScope('/p1');
    const a = store.createTabPlaceholder();
    store.bindSession(a, 'term-1', '/p1');
    const b = store.splitRight();
    store.bindSession(b, 'term-2', '/p1');
    store.setTerminalScope('/p2');
    store.createTabPlaceholder();

    const ids = store.removeTerminalScope('/p1');
    expect(ids.sort()).toEqual(['term-1', 'term-2']);

    const snap = store.getTerminalStoreSnapshot();
    expect(snap.panes.filter((p) => p.scopePath === '/p1')).toHaveLength(0);
    expect(store.hasTabs()).toBe(true);
  });

  it('removing the current scope leaves it empty until the next project event', () => {
    store.setTerminalScope('/p1');
    store.createTabPlaceholder();

    store.removeTerminalScope('/p1');
    const snap = store.getTerminalStoreSnapshot();
    expect(snap.panes).toHaveLength(0);
    expect(snap.layouts).toHaveLength(0);
  });

  it('panes created before the first project event are adopted into the first scope', () => {
    // Boot: dock bootstraps a pane before any projectChanged arrives
    const a = store.createTabPlaceholder();
    expect(store.getTerminalStoreSnapshot().panes.find((p) => p.localId === a).scopePath).toBe(null);

    expect(store.setTerminalScope('/boot')).toBe(true);

    const snap = store.getTerminalStoreSnapshot();
    expect(snap.layouts).toHaveLength(1);
    expect(snap.activeLocalId).toBe(a);
    expect(snap.panes.find((p) => p.localId === a).scopePath).toBe('/boot');

    // New panes spawn in the adopted scope
    const b = store.createTabPlaceholder();
    expect(store.getTerminalStoreSnapshot().panes.find((p) => p.localId === b).scopePath).toBe('/boot');
  });

  it('setTerminalScope reports false for scopes that never had tabs', () => {
    store.setTerminalScope('/p1');
    store.createTabPlaceholder();
    expect(store.setTerminalScope('/p2')).toBe(false);
  });

  it('notifies subscribers when the scope switches', () => {
    store.setTerminalScope('/p1');
    const listener = vi.fn();
    store.subscribeTerminalStore(listener);
    store.setTerminalScope('/p2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
