import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../wails.js';
import { TerminalPane } from './TerminalPane.jsx';
import {
  subscribeTerminalStore,
  getTerminalStoreSnapshot,
  createTabPlaceholder,
  bindSession,
  setActivePane,
  setActiveLayout,
  splitRight,
  setSplitRatio,
  removeLayout,
  removePaneBySessionId,
  hasTabs,
  layoutTitle,
  updatePaneCwdBySessionId,
  updatePaneTitleBySessionId,
} from './terminalStore.js';
import './terminal.css';

const MIN_HEIGHT = 120;

function maxHeight() {
  return Math.floor(window.innerHeight * 0.7);
}

function useTerminalStore() {
  const [snap, setSnap] = useState(getTerminalStoreSnapshot);
  useEffect(() => subscribeTerminalStore(() => setSnap(getTerminalStoreSnapshot())), []);
  return snap;
}

/**
 * Contained bottom terminal dock. When closed, collapses via CSS but keeps
 * pane hosts mounted — across all project scopes — so PTY + scrollback survive.
 * Tabs/visible panes reflect the current project/worktree scope only.
 */
export function TerminalDock({ open, height, onHeightChange, onRequestOpen, onTabClosed }) {
  const { panes, layouts, activeLayoutId, activeLocalId, splitLocalIds, splitRatio } = useTerminalStore();
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const splitDragRef = useRef(null);
  const bodyRef = useRef(null);
  const bootstrapping = useRef(false);

  const ensureSession = useCallback(async (localId) => {
    const snap = getTerminalStoreSnapshot();
    const pane = snap.panes.find((t) => t.localId === localId);
    if (!pane || pane.sessionId) return;
    try {
      const result = await api.terminalStart({
        cwd: pane.scopePath || null,
        cols: 80,
        rows: 24,
      });
      if (result?.id) {
        bindSession(localId, result.id, result.cwd);
      }
    } catch (err) {
      console.error('terminal start failed', err);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (hasTabs()) {
      const snap = getTerminalStoreSnapshot();
      snap.panes.forEach((t) => {
        if (!t.sessionId) void ensureSession(t.localId);
      });
      return;
    }
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    const localId = createTabPlaceholder('Terminal');
    void ensureSession(localId).finally(() => {
      bootstrapping.current = false;
    });
  }, [open, ensureSession]);

  useEffect(() => {
    panes.forEach((t) => {
      if (!t.sessionId) void ensureSession(t.localId);
    });
  }, [panes, ensureSession]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = drag.startY - e.clientY;
      const next = Math.min(maxHeight(), Math.max(MIN_HEIGHT, drag.startHeight + delta));
      onHeightChange?.(next);
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, onHeightChange]);

  function onResizePointerDown(e) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    setDragging(true);
  }

  function onSplitPointerDown(e) {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    splitDragRef.current = { startX: e.clientX, startRatio: splitRatio, width: body.clientWidth };
    const onMove = (ev) => {
      const drag = splitDragRef.current;
      if (!drag || drag.width <= 0) return;
      const delta = (ev.clientX - drag.startX) / drag.width;
      setSplitRatio(drag.startRatio + delta);
    };
    const onUp = () => {
      splitDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function handleCloseLayout(layoutId, e) {
    e?.stopPropagation();
    const sessionIds = removeLayout(layoutId);
    for (const sessionId of sessionIds) {
      try {
        await api.terminalStop(sessionId);
      } catch {
        // ignore
      }
    }
    onTabClosed?.(getTerminalStoreSnapshot().layouts);
  }

  function handleExit(sessionId) {
    removePaneBySessionId(sessionId);
    onTabClosed?.(getTerminalStoreSnapshot().layouts);
  }

  function handleNewTab() {
    const localId = createTabPlaceholder('Terminal');
    void ensureSession(localId);
  }

  function handleSplit() {
    const localId = splitRight();
    if (localId) void ensureSession(localId);
  }

  // Cmd+\ (mac) / Ctrl+\ — split right while terminal dock is open
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key !== '\\') return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      const localId = splitRight();
      if (localId) void ensureSession(localId);
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, ensureSession]);

  // Ctrl+Shift+` — open dock (if needed) and create a new terminal layout tab
  useEffect(() => {
    function onKey(e) {
      // Shift+` often reports as '~' depending on layout
      const isBacktick = e.key === '`' || e.key === '~' || e.code === 'Backquote';
      if (!isBacktick || !e.ctrlKey || !e.shiftKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      onRequestOpen?.();
      const localId = createTabPlaceholder('Terminal');
      void ensureSession(localId);
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ensureSession, onRequestOpen]);

  const dockHeight = open ? height : 0;
  const splitMode = splitLocalIds.length > 1;
  const twoPaneSplit = splitLocalIds.length === 2;

  return (
    <div
      class={`terminal-dock${open ? ' open' : ''}${dragging ? ' resizing' : ''}`}
      style={{ height: `${dockHeight}px` }}
      aria-hidden={!open}
      data-terminal-dock
    >
      <div
        class="terminal-resize-handle"
        onPointerDown={onResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
      />
      <div class="terminal-dock-header">
        <div class="terminal-tabs">
          {layouts.map((layout) => (
            <button
              type="button"
              key={layout.layoutId}
              class={`terminal-tab${layout.layoutId === activeLayoutId ? ' active' : ''}`}
              onClick={() => setActiveLayout(layout.layoutId)}
            >
              <span class="terminal-tab-title">{layoutTitle(layout)}</span>
              <span
                class="terminal-tab-close"
                role="button"
                tabIndex={-1}
                onClick={(e) => handleCloseLayout(layout.layoutId, e)}
                aria-label="Close terminal layout"
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div class="terminal-dock-actions">
          <button type="button" class="terminal-action" onClick={handleNewTab} title="New terminal (⌃⇧`)">
            +
          </button>
          <button type="button" class="terminal-action" onClick={handleSplit} title="Split right (⌘\\)">
            ⧉
          </button>
        </div>
      </div>
      <div class={`terminal-dock-body${splitMode ? ' split' : ''}`} ref={bodyRef}>
        {layouts.length === 0 && <div class="terminal-empty">No terminals in this project</div>}
        {[
          ...splitLocalIds.map((id) => panes.find((p) => p.localId === id)).filter(Boolean),
          ...panes.filter((p) => !splitLocalIds.includes(p.localId)),
        ].map((pane) => {
          const inSplit = splitLocalIds.includes(pane.localId);
          const splitIndex = splitLocalIds.indexOf(pane.localId);
          const visible = inSplit;
          let slotStyle;
          if (splitMode && visible) {
            if (twoPaneSplit && splitIndex === 0) {
              slotStyle = { flex: `0 0 ${splitRatio * 100}%` };
            } else if (twoPaneSplit) {
              slotStyle = { flex: '1 1 auto' };
            } else {
              slotStyle = { flex: '1 1 0', minWidth: 0 };
            }
          }
          return (
            <div
              key={pane.localId}
              class={`terminal-slot${visible ? ' visible' : ' parked'}`}
              style={slotStyle}
            >
              {twoPaneSplit && visible && splitIndex > 0 && (
                <div
                  class="terminal-split-handle"
                  onPointerDown={onSplitPointerDown}
                  role="separator"
                  aria-orientation="vertical"
                />
              )}
              <div class="terminal-slot-inner">
                {pane.sessionId ? (
                  <TerminalPane
                    sessionId={pane.sessionId}
                    focused={open && visible && pane.localId === activeLocalId}
                    onFocus={() => setActivePane(pane.localId)}
                    onExit={handleExit}
                    onCwdChange={updatePaneCwdBySessionId}
                    onTitleChange={updatePaneTitleBySessionId}
                  />
                ) : (
                  <div class="terminal-pane-loading">Starting…</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function isTerminalFocusTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('[data-terminal-dock]'));
}
