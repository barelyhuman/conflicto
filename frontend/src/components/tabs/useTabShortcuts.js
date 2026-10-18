import { useEffect } from 'preact/hooks';
import { isTerminalFocusTarget } from '../terminal/TerminalDock.jsx';

let lastClose = 0;

/**
 * Close the active tab. Both the native "Close Tab" menu item (macOS Cmd+W)
 * and the keydown fallback (Linux/Windows) route here; the guard keeps a
 * platform that delivers both from closing two tabs.
 */
export function closeActiveTab(tabs) {
  const now = Date.now();

  if (now - lastClose < 150) return;
  lastClose = now;
  const id = tabs.activeId.peek();

  if (id) tabs.requestClose(id);
}

/**
 * VS Code (macOS) tab shortcuts: Cmd+W close, Cmd+Shift+T reopen, Ctrl+Tab /
 * Ctrl+Shift+Tab MRU cycle, Cmd+1..9 select, Cmd+Option+Left/Right prev/next.
 * Non-mac uses Ctrl for the Cmd chords.
 *
 * @param {InstanceType<typeof import('../../models/tabs.js').TabsModel>} tabs
 * @param {boolean} isMac
 */
export function useTabShortcuts(tabs, isMac) {
  useEffect(() => {
    function onKeyDown(e) {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const inTerminal = isTerminalFocusTarget(e.target);

      // MRU cycle: Ctrl+Tab on every platform.
      if (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        tabs.cycleMru(e.shiftKey ? -1 : 1);

        return;
      }

      if (!mod || (inTerminal && !isMac)) return;

      const key = e.key.toLowerCase();

      if (key === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        closeActiveTab(tabs);
      } else if (key === 't' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        tabs.reopenClosed();
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        tabs.selectIndex(e.key === '9' ? -1 : Number(e.key) - 1);
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        tabs.step(e.key === 'ArrowRight' ? 1 : -1);
      }
    }

    function onKeyUp(e) {
      if (e.key === 'Control') tabs.endCycle();
    }

    function onBlur() {
      tabs.endCycle();
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [tabs, isMac]);
}
