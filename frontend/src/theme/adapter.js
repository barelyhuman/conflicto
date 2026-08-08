import { registerCustomTheme } from '@pierre/diffs';

export const appTokens = {
  dark: {
    bg: '#0a0a0a',
    surface: '#111111',
    surfaceRaised: '#171717',
    border: '#262626',
    borderSubtle: '#1a1a1a',
    text: '#e5e5e5',
    textHigh: '#f5f5f5',
    textMuted: '#737373',
    accent: '#f5f5f5',
    accentBg: '#1a1a1a',
    accentHover: '#262626',
    added: '#e5e5e5',
    addedBg: '#152a15',
    addedBorder: '#153f15',
    removed: '#e5e5e5',
    removedBg: '#2a1515',
    removedBorder: '#3f1515',
    conflictAmber: '#a3a3a3',
    conflictAmberBg: '#1a1a1a',
    conflictAmberBorder: '#262626',
  },
};

/** Maps token keys to CSS custom property names used by the app. */
function tokenToCssVar(key) {
  if (key === 'textHigh') return '--text-h';
  return '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

export function injectAppTheme() {
  const tokens = appTokens.dark;
  const css = Object.entries(tokens)
    .map(([k, v]) => `${tokenToCssVar(k)}: ${v};`)
    .join('\n');

  const existing = document.getElementById('conflicto-theme');
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = 'conflicto-theme';
  style.textContent = `:root {\n${css}\n}`;
  document.head.appendChild(style);
}

/**
 * Full Shiki/VS Code theme derived from appTokens.
 * Pierre reads workbench colors (gitDecoration / ANSI) for add/delete chrome.
 */
export function createAppShikiTheme() {
  const t = appTokens.dark;
  // Fixed gray mid-step — do not use addedBorder (green) for syntax
  const mid = t.conflictAmber;

  return {
    name: 'conflicto-dark',
    type: 'dark',
    colors: {
      'editor.background': t.surface,
      'editor.foreground': t.text,
      'editor.lineHighlightBackground': t.accentBg,
      'editorGutter.background': t.surface,
      'editorLineNumber.foreground': t.textMuted,
      'editorLineNumber.activeForeground': t.text,
      'diffEditor.insertedTextBackground': t.addedBg,
      'diffEditor.deletedTextBackground': t.removedBg,
      'diffEditor.insertedLineBackground': t.addedBg,
      'diffEditor.removedLineBackground': t.removedBg,
      // Pierre → --diffs-addition/deletion/modified-color
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
  const theme = createAppShikiTheme();
  registerCustomTheme('conflicto-dark', () => Promise.resolve(theme));
  return theme;
}
