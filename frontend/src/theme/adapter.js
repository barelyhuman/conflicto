import { createCSSVariablesTheme, registerCustomTheme } from '@pierre/diffs';

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
    added: '#0a0a0a',
    addedBg: '#ffffff',
    addedBorder: '#a3a3a3',
    removed: '#e5e5e5',
    removedBg: '#2a1515',
    removedBorder: '#3f1515',
    conflictAmber: '#a3a3a3',
    conflictAmberBg: '#1a1a1a',
    conflictAmberBorder: '#262626',
  },
};

export function injectAppTheme() {
  const tokens = appTokens.dark;
  const css = Object.entries(tokens)
    .map(([k, v]) => {
      const varName = '--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      return `${varName}: ${v};`;
    })
    .join('\n');

  const style = document.createElement('style');
  style.id = 'conflicto-theme';
  style.textContent = `:root {\n${css}\n}`;
  document.head.appendChild(style);
}

export function createAppShikiTheme() {
  const t = appTokens.dark;
  return createCSSVariablesTheme({
    name: 'conflicto-dark',
    variablePrefix: '--',
    colorReplacements: {
      'editor.background': t.surface,
      'editor.foreground': t.text,
      'editor.lineHighlightBackground': t.accentBg,
      'diffEditor.insertedTextBackground': t.addedBg,
      'diffEditor.removedTextBackground': t.removedBg,
      'diffEditor.insertedLineBackground': t.addedBg,
      'diffEditor.removedLineBackground': t.removedBg,
      'editorGutter.background': t.surface,
      'editorLineNumber.foreground': t.textMuted,
    },
  });
}

export function registerAppTheme() {
  const theme = createAppShikiTheme();
  registerCustomTheme('conflicto-dark', () => Promise.resolve(theme));
  return theme;
}
