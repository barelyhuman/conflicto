import { registerCustomTheme } from '@pierre/diffs';

/** @typedef {'light' | 'dark'} ThemeMode */

export const appTokens = {
  light: {
    bg: '#fafafa',
    surface: '#ececec',
    surfaceRaised: '#ffffff',
    border: '#e5e5e5',
    borderSubtle: '#e5e5e5',
    text: '#171717',
    textHigh: '#171717',
    textMuted: '#737373',
    accent: '#171717',
    accentBg: 'rgba(127,127,127,0.12)',
    accentHover: 'rgba(127,127,127,0.16)',
    // Soft GitHub-style diff line hues (Pierre/Shiki only; UI chrome stays mono)
    added: '#1a7f37',
    addedBg: 'rgba(26,127,55,0.12)',
    addedBorder: '#1a7f37',
    removed: '#cf222e',
    removedBg: 'rgba(207,34,46,0.10)',
    removedBorder: '#cf222e',
    conflictAmber: '#737373',
    conflictAmberBg: 'rgba(127,127,127,0.12)',
    conflictAmberBorder: '#e5e5e5',
  },
  dark: {
    bg: '#0a0a0a',
    surface: '#161616',
    surfaceRaised: '#171717',
    border: '#262626',
    borderSubtle: '#262626',
    text: '#fafafa',
    textHigh: '#fafafa',
    textMuted: '#a3a3a3',
    accent: '#fafafa',
    accentBg: 'rgba(127,127,127,0.12)',
    accentHover: 'rgba(127,127,127,0.16)',
    // Soft GitHub-style diff line hues (Pierre/Shiki only; UI chrome stays mono)
    added: '#3fb950',
    addedBg: 'rgba(63,185,80,0.15)',
    addedBorder: '#3fb950',
    removed: '#f85149',
    removedBg: 'rgba(248,81,73,0.15)',
    removedBorder: '#f85149',
    conflictAmber: '#a3a3a3',
    conflictAmberBg: 'rgba(127,127,127,0.12)',
    conflictAmberBorder: '#262626',
  },
};

/**
 * @param {ThemeMode} [mode]
 */
export function resolveThemeMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Full Shiki/VS Code theme derived from appTokens.
 * Syntax highlighting stays monochrome; insert/delete line chrome uses added/removed.
 * @param {ThemeMode} [mode]
 */
export function createAppShikiTheme(mode) {
  const resolved = resolveThemeMode(mode);
  const t = appTokens[resolved];
  const mid = t.textMuted;

  return {
    name: resolved === 'dark' ? 'conflicto-dark' : 'conflicto-light',
    type: resolved,
    colors: {
      'editor.background': t.surfaceRaised,
      'editor.foreground': t.text,
      'editor.lineHighlightBackground': t.accentBg,
      'editorGutter.background': t.surfaceRaised,
      'editorLineNumber.foreground': t.textMuted,
      'editorLineNumber.activeForeground': t.text,
      'diffEditor.insertedTextBackground': t.addedBg,
      'diffEditor.deletedTextBackground': t.removedBg,
      'diffEditor.insertedLineBackground': t.addedBg,
      'diffEditor.removedLineBackground': t.removedBg,
      'gitDecoration.addedResourceForeground': t.addedBorder,
      'gitDecoration.deletedResourceForeground': t.removedBorder,
      'gitDecoration.modifiedResourceForeground': t.conflictAmber,
      'terminal.ansiGreen': t.addedBorder,
      'terminal.ansiRed': t.removedBorder,
      'terminal.ansiBlue': t.conflictAmber,
      'terminal.ansiBlack': t.bg,
      'terminal.ansiWhite': t.text,
      'terminal.ansiYellow': mid,
      'terminal.ansiMagenta': mid,
      'terminal.ansiCyan': mid,
      'terminal.ansiBrightBlack': t.textMuted,
      'terminal.ansiBrightRed': t.removed,
      'terminal.ansiBrightGreen': t.added,
      'terminal.ansiBrightYellow': t.textHigh,
      'terminal.ansiBrightBlue': t.conflictAmber,
      'terminal.ansiBrightMagenta': t.text,
      'terminal.ansiBrightCyan': mid,
      'terminal.ansiBrightWhite': t.textHigh,
    },
    tokenColors: [
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.quoted.docstring'],
        settings: { foreground: t.textMuted },
      },
      {
        scope: [
          'punctuation',
          'meta.brace',
          'meta.delimiter',
          'keyword.operator',
        ],
        settings: { foreground: t.textMuted },
      },
      {
        scope: ['string', 'constant.other.symbol', 'markup.inline'],
        settings: { foreground: mid },
      },
      {
        scope: [
          'constant.numeric',
          'constant.language',
          'constant.character',
          'support.constant',
        ],
        settings: { foreground: mid },
      },
      {
        scope: [
          'keyword',
          'storage',
          'storage.type',
          'storage.modifier',
        ],
        settings: { foreground: t.text },
      },
      {
        scope: [
          'entity.name.function',
          'support.function',
          'meta.function-call',
        ],
        settings: { foreground: t.textHigh },
      },
      {
        scope: [
          'entity.name.type',
          'entity.name.class',
          'support.type',
          'support.class',
        ],
        settings: { foreground: t.textHigh },
      },
      {
        scope: ['variable', 'variable.other', 'meta.definition.variable'],
        settings: { foreground: t.text },
      },
      {
        scope: ['variable.parameter'],
        settings: { foreground: mid },
      },
      {
        scope: ['entity.name.tag', 'support.type.property-name'],
        settings: { foreground: t.text },
      },
      {
        scope: ['entity.other.attribute-name'],
        settings: { foreground: mid },
      },
      {
        scope: ['invalid'],
        settings: { foreground: t.removed },
      },
    ],
  };
}

export function registerAppTheme() {
  registerCustomTheme('conflicto-dark', () => Promise.resolve(createAppShikiTheme('dark')));
  registerCustomTheme('conflicto-light', () => Promise.resolve(createAppShikiTheme('light')));
}
