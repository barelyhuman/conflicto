export function readCssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Monochrome xterm theme mapped from Conflicto CSS tokens. */
export function terminalTheme() {
  return {
    background: readCssVar('--surface', '#111111'),
    foreground: readCssVar('--text', '#e5e5e5'),
    cursor: readCssVar('--text-h', '#f5f5f5'),
    cursorAccent: readCssVar('--bg', '#0a0a0a'),
    selectionBackground: readCssVar('--accent-hover', '#262626'),
    selectionForeground: readCssVar('--text-h', '#f5f5f5'),
    black: '#0a0a0a',
    red: readCssVar('--removed', '#f87171'),
    green: readCssVar('--added', '#4ade80'),
    yellow: '#a3a3a3',
    blue: '#737373',
    magenta: '#a3a3a3',
    cyan: '#737373',
    white: '#e5e5e5',
    brightBlack: '#525252',
    brightRed: readCssVar('--removed', '#f87171'),
    brightGreen: readCssVar('--added', '#4ade80'),
    brightYellow: '#d4d4d4',
    brightBlue: '#a3a3a3',
    brightMagenta: '#d4d4d4',
    brightCyan: '#a3a3a3',
    brightWhite: '#f5f5f5',
  };
}
