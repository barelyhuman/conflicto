import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../wails.js';
import { TerminalPane } from './TerminalPane.jsx';
import {
  subscribeTerminalStore,
  getTerminalStoreSnapshot,
  createTabPlaceholder,
  bindSession,
  setActiveTab,
  splitRight,
  setSplitRatio,
  removeTab,
  removeTabBySessionId,
  hasTabs,
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
 * pane hosts mounted so PTY + scrollback survive.
 */
export function TerminalDock({ open, height, onHeightChange, projectPath, onRequestOpen }) {
  const { tabs, activeLocalId, splitLocalIds, splitRatio } = useTerminalStore();
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const splitDragRef = useRef(null);
  const bodyRef = useRef(null);
  const bootstrapping = useRef(false);

  const ensureSession = useCallback(async (localId) => {
    const snap = getTerminalStoreSnapshot();
    const tab = snap.tabs.find((t) => t.localId === localId);
    if (!tab || tab.sessionId) return;
    try {
      const result = await api.terminalStart({
        cwd: projectPath || null,
        cols: 80,
        rows: 24,
      });
      if (result?.id) {
        bindSession(localId, result.id, result.cwd);
      }
    } catch (err) {
      console.error('terminal start failed', err);
    }
  }, [projectPath]);

  useEffect(() => {
    if (!open) return;
    if (hasTabs()) {
      const snap = getTerminalStoreSnapshot();
      snap.tabs.forEach((t) => {
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
    tabs.forEach((t) => {
      if (!t.sessionId) void ensureSession(t.localId);
    });
  }, [tabs, ensureSession]);

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

  async function handleCloseTab(localId, e) {
    e?.stopPropagation();
    const sessionId = removeTab(localId);
    if (sessionId) {
      try {
        await api.terminalStop(sessionId);
      } catch {
        // ignore
      }
    }
  }

  function handleExit(sessionId) {
    removeTabBySessionId(sessionId);
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

  // Ctrl+Shift+` — open dock (if needed) and create a new terminal tab
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
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.localId}
              class={`terminal-tab${tab.localId === activeLocalId ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.localId)}
            >
              <span class="terminal-tab-title">{tab.title || 'Terminal'}</span>
              <span
                class="terminal-tab-close"
                role="button"
                tabIndex={-1}
                onClick={(e) => handleCloseTab(tab.localId, e)}
                aria-label="Close terminal"
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
        {tabs.map((tab) => {
          const inSplit = splitLocalIds.includes(tab.localId);
          const splitIndex = splitLocalIds.indexOf(tab.localId);
          const visible = inSplit;
          return (
            <div
              key={tab.localId}
              class={`terminal-slot${visible ? ' visible' : ' parked'}`}
              style={
                splitMode && visible && splitIndex === 0
                  ? { flex: `0 0 ${splitRatio * 100}%` }
                  : splitMode && visible
                    ? { flex: '1 1 auto' }
                    : undefined
              }
            >
              {splitMode && visible && splitIndex > 0 && (
                <div
                  class="terminal-split-handle"
                  onPointerDown={onSplitPointerDown}
                  role="separator"
                  aria-orientation="vertical"
                />
              )}
              <div class="terminal-slot-inner">
                {tab.sessionId ? (
                  <TerminalPane
                    sessionId={tab.sessionId}
                    focused={open && visible && tab.localId === activeLocalId}
                    onFocus={() => setActiveTab(tab.localId)}
                    onExit={handleExit}
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
