import { useEffect } from 'preact/hooks';
import { getActiveView } from '../models/editorRegistry.js';
import { isTerminalFocusTarget } from '../components/terminal/TerminalDock.jsx';
import { codeNav, searchModel } from './index.js';

/** Single-line editor selection to seed the search query, if any. */
function selectionSeed() {
  const view = getActiveView();

  if (!view) return '';
  const { from, to } = view.state.selection.main;

  if (from === to || to - from > 120) return '';
  const text = view.state.sliceDoc(from, to);

  return text.includes('\n') ? '' : text;
}

/**
 * App-level code navigation shortcuts (VS Code):
 *  - Cmd+Shift+F (Ctrl+Shift+F elsewhere): global search
 *  - Ctrl+- / Ctrl+Shift+- on macOS, Alt+Left / Alt+Right elsewhere: back / forward
 * Editor-local keys (F12, Shift+F12, Cmd-click) live in the CodeMirror extension.
 *
 * @param {{ isMac: boolean, onOpenSearch?: () => void }} opts
 */
export function useCodeShortcuts({ isMac, onOpenSearch }) {
  useEffect(() => {
    function onKeyDown(e) {
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

      if (mod && e.shiftKey && !e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        e.stopPropagation();
        onOpenSearch?.();
        searchModel.open(selectionSeed());

        return;
      }

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
  }, [isMac, onOpenSearch]);
}
