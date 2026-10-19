import { createModel, signal, computed, batch } from '@preact/signals';

/**
 * Editor tabs, scoped per worktree (project path).
 *
 * Switching worktrees swaps the visible tab set; switching back restores it
 * (same pattern as the terminal store's scopes). State is in-memory for the
 * session — see the task notes for why we do not persist to the backend.
 *
 * Tab kinds:
 *  - `diff`: a changed file's diff. `mode` is working | staged | pr | conflict.
 *  - `file`: an editable source file (CodeMirror).
 *  - `pr`: a pull request (`pr:<number>`), never a preview tab. Its state lives
 *    in the PR tab registry (models/prTab.js), keyed by scope + number.
 * Identity is kind + path, so re-opening focuses the existing tab.
 *
 * @typedef {'working' | 'staged' | 'conflict'} DiffMode
 * @typedef {{
 *   id: string,
 *   kind: 'diff' | 'file' | 'pr',
 *   path: string,
 *   mode?: DiffMode,
 *   number?: number,
 *   title?: string,
 *   preview: boolean,
 *   dirty: boolean,
 * }} Tab
 */

const MAX_CLOSED = 25;

const SECTION_BY_MODE = /** @type {const} */ ({
  working: 'unstaged',
  staged: 'staged',
  conflict: 'conflict',
});

const MODE_BY_SECTION = /** @type {const} */ ({
  unstaged: 'working',
  staged: 'staged',
  conflict: 'conflict',
});

/** @param {DiffMode} mode */
export function sectionForMode(mode) {
  return SECTION_BY_MODE[mode] ?? 'unstaged';
}

/** @param {string} section */
export function modeForSection(section) {
  return MODE_BY_SECTION[section] ?? 'working';
}

/** Strip title for a PR tab: `#<n> <title>`. */
export function prTabTitle(number, title) {
  return title ? `#${number} ${title}` : `#${number}`;
}

/**
 * @param {'diff' | 'file' | 'pr'} kind
 * @param {string} path
 */
export function tabId(kind, path) {
  return `${kind}:${path}`;
}

function newScopeState() {
  return {
    /** @type {Tab[]} */
    tabs: [],
    /** @type {string | null} */
    activeId: null,
    /** Most-recently-used first. */
    /** @type {string[]} */
    mru: [],
    /** Most-recently-closed last. */
    /** @type {Tab[]} */
    closed: [],
    seeded: false,
  };
}

export const TabsModel = createModel(() => {
  /** @type {Map<string | null, ReturnType<typeof newScopeState>>} */
  const scopes = new Map();
  /** @type {string | null} */
  let scopeKey = null;
  let cur = newScopeState();
  scopes.set(scopeKey, cur);

  const scope = signal(/** @type {string | null} */ (null));
  const tabs = signal(/** @type {Tab[]} */ ([]));
  const activeId = signal(/** @type {string | null} */ (null));
  /** Tab id awaiting a "discard unsaved changes?" answer. */
  const pendingClose = signal(/** @type {string | null} */ (null));

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? null);
  const activeKind = computed(() => activeTab.value?.kind ?? null);
  const hasTabs = computed(() => tabs.value.length > 0);

  /** @type {Set<(scopeKey: string | null, tab: Tab) => void>} */
  const discardListeners = new Set();

  /** Live MRU cycle (Ctrl+Tab held). */
  let cycle = /** @type {null | { list: string[], idx: number }} */ (null);

  function sync() {
    // One notification: views keyed by scope + active tab must never see them half-updated.
    batch(() => {
      tabs.value = cur.tabs;
      activeId.value = cur.activeId;
      scope.value = scopeKey;
    });
  }

  /** @param {Tab} tab */
  function discarded(tab, key = scopeKey) {
    discardListeners.forEach((fn) => fn(key, tab));
  }

  function touchMru(id) {
    cur.mru = [id, ...cur.mru.filter((x) => x !== id)];
  }

  function setTabs(next) {
    cur.tabs = next;
  }

  function replaceTab(id, patch) {
    setTabs(cur.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function find(id) {
    return cur.tabs.find((t) => t.id === id) ?? null;
  }

  const api = {
    scope,
    tabs,
    activeId,
    activeTab,
    activeKind,
    hasTabs,
    pendingClose,

    /** Current scope key (worktree path). */
    currentScope() {
      return scopeKey;
    },

    /**
     * Switch the active worktree. Idempotent; the first real scope adopts tabs
     * opened before the project path was known.
     * @param {string | null | undefined} path
     */
    setScope(path) {
      const key = path || null;

      if (key === scopeKey) return;
      cycle = null;
      pendingClose.value = null;

      if (!scopes.has(key)) {
        const orphan = scopeKey === null && key !== null ? scopes.get(null) : null;

        if (orphan && orphan.tabs.length > 0) {
          scopes.delete(null);
          scopes.set(key, orphan);
        } else {
          scopes.set(key, newScopeState());
        }
      }

      scopeKey = key;
      cur = /** @type {NonNullable<ReturnType<typeof scopes.get>>} */ (scopes.get(key));
      sync();
    },

    /** Drop a whole scope (worktree removed). */
    removeScope(path) {
      const key = path || null;
      const state = scopes.get(key);

      if (!state) return;
      state.tabs.forEach((t) => discarded(t, key));

      if (key === scopeKey) {
        cur = newScopeState();
        scopes.set(key, cur);
        sync();
      } else {
        scopes.delete(key);
      }
    },

    /** Scope keys that currently have open tabs (other UI may badge them). */
    scopesWithTabs() {
      return [...scopes.entries()].filter(([, s]) => s.tabs.length > 0).map(([k]) => k);
    },

    /**
     * Open (or focus) a tab.
     * @param {{ kind: 'diff' | 'file' | 'pr', path?: string, number?: number, title?: string, mode?: DiffMode, preview?: boolean, activate?: boolean }} spec
     * @returns {Tab | null}
     */
    open({ kind, path, number, title, mode = 'working', preview = false, activate = true }) {
      if (kind === 'pr') {
        if (!Number.isInteger(number) || number <= 0) return null;
        path = String(number);
        preview = false;
      }

      if (!path) return null;
      const id = tabId(kind, path);
      const existing = find(id);

      if (existing) {
        const patch = {};

        if (!preview && existing.preview) patch.preview = false;

        if (kind === 'diff' && existing.mode !== mode) patch.mode = mode;

        if (kind === 'pr' && title && existing.title !== title) patch.title = title;

        if (Object.keys(patch).length > 0) replaceTab(id, patch);

        if (activate) api.activate(id);
        else sync();

        return find(id);
      }

      /** @type {Tab} */
      const tab = { id, kind, path, preview, dirty: false };

      if (kind === 'diff') tab.mode = mode;

      if (kind === 'pr') {
        tab.number = number;
        tab.title = title || prTabTitle(number);
      }

      let next = cur.tabs.slice();
      const previewIdx = preview ? next.findIndex((t) => t.preview && !t.dirty) : -1;

      if (previewIdx >= 0) {
        const old = next[previewIdx];
        next[previewIdx] = tab;
        cur.mru = cur.mru.filter((x) => x !== old.id);

        if (cur.activeId === old.id) cur.activeId = id;
        discarded(old);
      } else {
        next = [...next, tab];
      }

      setTabs(next);

      if (activate) {
        api.activate(id);
      } else {
        cur.mru = [...cur.mru, id];
        sync();
      }

      return tab;
    },

    /** @param {string} id */
    activate(id) {
      if (!find(id)) return;
      cur.activeId = id;
      touchMru(id);
      sync();
    },

    /** Rename a tab (PR tabs learn their title after the details load). */
    setTitle(id, title) {
      const tab = find(id);

      if (!tab || !title || tab.title === title) return;
      replaceTab(id, { title });
      sync();
    },

    /**
     * Move a tab between scopes, keeping the same tab object (no discard
     * event, not recorded as closed). The tab becomes active in `toScope`.
     * @returns {Tab | null} the tab in its new scope
     */
    moveTab(id, fromScope, toScope) {
      const fk = fromScope || null;
      const tk = toScope || null;
      const src = scopes.get(fk);
      const tab = src?.tabs.find((t) => t.id === id);

      if (!src || !tab) return null;

      if (fk === tk) return tab;
      src.tabs = src.tabs.filter((t) => t.id !== id);
      src.mru = src.mru.filter((x) => x !== id);

      if (src.activeId === id) {
        src.activeId = src.mru[0] ?? src.tabs[src.tabs.length - 1]?.id ?? null;
      }

      let dst = scopes.get(tk);

      if (!dst) {
        dst = newScopeState();
        scopes.set(tk, dst);
      }

      if (!dst.tabs.some((t) => t.id === id)) dst.tabs = [...dst.tabs, tab];
      dst.activeId = id;
      dst.mru = [id, ...dst.mru.filter((x) => x !== id)];

      if (cycle) cycle = null;

      sync();

      return tab;
    },

    /** Promote a preview tab to a regular one. */
    pin(id) {
      const tab = find(id);

      if (!tab || !tab.preview) return;
      replaceTab(id, { preview: false });
      sync();
    },

    /** Dirty tabs are always pinned. */
    setDirty(id, dirty) {
      const tab = find(id);

      if (!tab || tab.dirty === dirty) return;
      replaceTab(id, dirty ? { dirty, preview: false } : { dirty });
      sync();
    },

    /** Close without any dirty check. */
    close(id) {
      const idx = cur.tabs.findIndex((t) => t.id === id);

      if (idx < 0) return;
      const tab = cur.tabs[idx];
      setTabs(cur.tabs.filter((t) => t.id !== id));
      cur.mru = cur.mru.filter((x) => x !== id);
      cur.closed = [...cur.closed, { ...tab, dirty: false, preview: false }].slice(-MAX_CLOSED);

      if (cur.activeId === id) {
        const fallback = cur.mru[0] ?? cur.tabs[Math.min(idx, cur.tabs.length - 1)]?.id ?? null;
        cur.activeId = fallback;

        if (fallback) touchMru(fallback);
      }

      if (pendingClose.peek() === id) pendingClose.value = null;
      discarded(tab);
      sync();
    },

    /** Close, but ask first when the tab has unsaved edits. */
    requestClose(id) {
      const tab = find(id);

      if (!tab) return;

      if (tab.dirty) {
        pendingClose.value = id;

        return;
      }

      api.close(id);
    },

    confirmPendingClose() {
      const id = pendingClose.peek();
      pendingClose.value = null;

      if (id) api.close(id);
    },

    cancelPendingClose() {
      pendingClose.value = null;
    },

    /** Close every other tab; tabs with unsaved edits are left open. */
    closeOthers(id) {
      cur.tabs
        .filter((t) => t.id !== id && !t.dirty)
        .forEach((t) => api.close(t.id));
      api.activate(id);
    },

    /** Close all tabs matching `pred` (no dirty check; used for mode switches). */
    closeWhere(pred) {
      cur.tabs.filter(pred).forEach((t) => api.close(t.id));
    },

    /** Reopen the most recently closed tab (pinned). */
    reopenClosed() {
      const tab = cur.closed[cur.closed.length - 1];

      if (!tab) return null;
      cur.closed = cur.closed.slice(0, -1);

      return api.open({
        kind: tab.kind,
        path: tab.path,
        number: tab.number,
        title: tab.title,
        mode: tab.mode,
        preview: false,
      });
    },

    /** Move tab `id` to `toIndex` in the strip. */
    reorder(id, toIndex) {
      const from = cur.tabs.findIndex((t) => t.id === id);

      if (from < 0) return;
      const to = Math.max(0, Math.min(toIndex, cur.tabs.length - 1));

      if (from === to) return;
      const next = cur.tabs.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setTabs(next);
      sync();
    },

    /** Select the n-th tab (0-based); `n >= length` or -1 selects the last (VS Code Cmd+9). */
    selectIndex(n) {
      const list = cur.tabs;

      if (list.length === 0) return;
      const tab = n < 0 || n >= list.length ? list[list.length - 1] : list[n];
      api.activate(tab.id);
    },

    /** Step through the strip order. */
    step(delta) {
      const list = cur.tabs;

      if (list.length < 2) return;
      const idx = list.findIndex((t) => t.id === cur.activeId);
      const next = list[(idx + delta + list.length) % list.length];
      api.activate(next.id);
    },

    /**
     * MRU cycle (Ctrl+Tab). Keep calling while Control is held; call
     * `endCycle()` on release to commit the choice to the MRU order.
     * @param {1 | -1} dir
     */
    cycleMru(dir) {
      if (!cycle) {
        const list = cur.mru.filter((id) => find(id));

        if (list.length < 2) return;
        cycle = { list, idx: 0 };
      }

      const n = cycle.list.length;
      cycle.idx = (cycle.idx + dir + n) % n;
      cur.activeId = cycle.list[cycle.idx];
      sync();
    },

    endCycle() {
      if (!cycle) return;
      cycle = null;

      if (cur.activeId) touchMru(cur.activeId);
    },

    /** MRU order of tab ids in the current scope (read-only copy). */
    mruOrder() {
      return cur.mru.slice();
    },

    /** True until the first auto-opened tab for this scope (initial first-file preview). */
    canSeed() {
      return !cur.seeded && cur.tabs.length === 0;
    },

    markSeeded() {
      cur.seeded = true;
    },

    /** Subscribe to tabs that leave a scope for good (closed, replaced preview, scope removed). */
    onDiscard(fn) {
      discardListeners.add(fn);

      return () => discardListeners.delete(fn);
    },
  };

  return api;
});

/** App-wide tabs store. */
export const tabsStore = new TabsModel();
