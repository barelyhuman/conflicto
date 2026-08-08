export function readCssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * xterm chrome only — match Conflicto surface/text.
 * ANSI / bright ANSI colors intentionally omitted so xterm keeps its defaults.
 */
export function terminalTheme() {
  return {
    background: readCssVar('--surface', '#111111'),
    foreground: readCssVar('--text', '#e5e5e5'),
    cursor: readCssVar('--text-h', '#f5f5f5'),
    cursorAccent: readCssVar('--bg', '#0a0a0a'),
    selectionBackground: readCssVar('--accent-hover', '#262626'),
    selectionForeground: readCssVar('--text-h', '#f5f5f5'),
  };
}
