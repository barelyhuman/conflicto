import { useEffect } from 'preact/hooks';
import { isTerminalFocusTarget } from '../components/terminal/TerminalDock.jsx';
import { codeNav } from './index.js';

/**
 * App-level code navigation shortcuts (VS Code):
 *  - Ctrl+- / Ctrl+Shift+- on macOS, Alt+Left / Alt+Right elsewhere: back / forward
 * Editor-local keys (F12, Shift+F12, Cmd-click) live in the CodeMirror extension.
 *
 * @param {{ isMac: boolean }} opts
 */
export function useCodeShortcuts({ isMac }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (isTerminalFocusTarget(e.target)) return;

      if (isMac) {
        if (e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'Minus') {
          e.preventDefault();
          e.stopPropagation();

          if (e.shiftKey) codeNav.forward();
          else codeNav.back();
        }
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          codeNav.back();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          codeNav.forward();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown, true);

    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isMac]);
}
