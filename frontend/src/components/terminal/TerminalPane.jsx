import { useEffect, useRef } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../../wails.js';
import { terminalTheme } from './terminalTheme.js';

function decodeTerminalPayload(payload) {
  const raw = payload?.data ?? '';
  if (payload?.enc === 'b64') {
    try {
      const bin = atob(raw);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Long-lived xterm pane bound to a PTY session.
 * Does not stop the PTY on unmount/hide — only on explicit dispose via parent.
 */
export function TerminalPane({
  sessionId,
  focused,
  onFocus,
  onExit,
  onCwdChange,
  onTitleChange,
}) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const sessionIdRef = useRef(sessionId);
  const onExitRef = useRef(onExit);
  const onCwdChangeRef = useRef(onCwdChange);
  const onTitleChangeRef = useRef(onTitleChange);
  const disposedRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    onCwdChangeRef.current = onCwdChange;
  }, [onCwdChange]);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !sessionId) return undefined;

    disposedRef.current = false;

    const term = new Terminal({
      // Keep xterm's default renderer: the optional WebGL renderer can
      // composite zsh autosuggestions incorrectly when panes are split.
      // Real PTY already speaks CRLF — convertEol doubles newlines and skews TUIs
      convertEol: false,
      cursorBlink: true,
      // Prefer fonts with solid box/block glyphs for agent TUIs
      fontFamily:
        '"SF Mono", Menlo, Monaco, "Cascadia Mono", "Cascadia Code", "Courier New", monospace',
      fontSize: 13,
      // Critical for box-drawing / half-block logos — >1 leaves gaps between rows
      lineHeight: 1,
      letterSpacing: 0,
      theme: terminalTheme(),
      // Option/Alt as Meta on macOS — agent TUI shortcuts
      macOptionIsMeta: true,
      allowProposedApi: true,
      scrollback: 5000,
      drawBoldTextInBrightColors: true,
      windowsPty: undefined,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Agent-TUI key fidelity: Shift+Enter → ESC+CR (newline), not submit.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;

      // Shift+Enter → send \x1b\r and consume so xterm does not also send \r
      if (ev.key === 'Enter' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        ev.preventDefault();
        void api.terminalWrite(sessionIdRef.current, '\x1b\r');
        return false;
      }

      // Ctrl+J → LF newline fallback (universal in agent TUIs)
      if (ev.key === 'j' && ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
        ev.preventDefault();
        void api.terminalWrite(sessionIdRef.current, '\n');
        return false;
      }

      // Let Ctrl+` / Ctrl+Shift+` bubble for dock actions — do not send to PTY
      if ((ev.key === '`' || ev.key === '~' || ev.code === 'Backquote') && ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        return false;
      }

      // Let Cmd/Ctrl+\ bubble for split right — do not send to PTY
      if (ev.key === '\\' && (ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey) {
        return false;
      }

      return true;
    });

    const onDataDisp = term.onData((data) => {
      void api.terminalWrite(sessionIdRef.current, data);
    });

    // OSC 7: file://host/path — shell reports cwd (macOS Terminal / iTerm / modern zsh)
    const osc7Disp = term.parser.registerOscHandler(7, (data) => {
      const cwd = parseOsc7Cwd(data);
      if (cwd) onCwdChangeRef.current?.(sessionIdRef.current, cwd);
      return true;
    });

    const titleDisp = term.onTitleChange((title) => {
      onTitleChangeRef.current?.(sessionIdRef.current, title);
    });

    const offData = api.onTerminalData((payload) => {
      if (!payload || payload.id !== sessionIdRef.current) return;
      if (disposedRef.current) return;
      term.write(decodeTerminalPayload(payload));
    });

    const offExit = api.onTerminalExit((payload) => {
      if (!payload || payload.id !== sessionIdRef.current) return;
      onExitRef.current?.(payload.id, payload.code);
    });

    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          if (host.clientWidth < 20 || host.clientHeight < 20) return;
          fit.fit();
          void api.terminalResize(sessionIdRef.current, term.cols, term.rows);
        } catch {
          // ignore fit while hidden/zero-size
        }
      }, 16);
    });
    ro.observe(host);

    // Initial resize after layout
    requestAnimationFrame(() => {
      try {
        fit.fit();
        void api.terminalResize(sessionId, term.cols, term.rows);
      } catch {
        // ignore
      }
    });

    return () => {
      disposedRef.current = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      offData?.();
      offExit?.();
      onDataDisp.dispose();
      osc7Disp.dispose();
      titleDisp.dispose();
      // Do NOT call terminalStop — hide must keep PTY alive.
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]); // re-init only if session id changes

  useEffect(() => {
    if (!focused) return;
    const term = termRef.current;
    if (term) {
      term.focus();
    }
  }, [focused]);

  // Re-fit when becoming visible/focused (dock reopened)
  useEffect(() => {
    if (!focused) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
        void api.terminalResize(sessionId, term.cols, term.rows);
        term.focus();
      } catch {
        // ignore
      }
    });
  }, [focused, sessionId]);

  return (
    <div
      class={`terminal-pane${focused ? ' focused' : ''}`}
      onMouseDown={() => onFocus?.(sessionId)}
      data-terminal-pane={sessionId}
    >
      <div class="terminal-host" ref={hostRef} />
    </div>
  );
}

/** Parse OSC 7 payload like `file://hostname/Users/foo` → `/Users/foo`. */
// TODO: reaper - probably need a more reliable way to get this out
function parseOsc7Cwd(data) {
  if (!data || typeof data !== 'string') return null;
  try {
    if (data.startsWith('file://')) {
      const url = new URL(data);
      let path = decodeURIComponent(url.pathname || '');
      // Windows: file:///C:/Users/... → pathname "/C:/Users/..."
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      return path || null;
    }
    // Some shells send a bare path
    if (data.startsWith('/')) return data;
  } catch {
    // ignore malformed
  }
  return null;
}
