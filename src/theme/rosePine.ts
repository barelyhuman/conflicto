import { variants } from '@rose-pine/palette'
import type { editor } from 'monaco-editor'
import { normalizeHex } from './derive'
import type { MonacoBase } from './tokens'

type RoseColors = (typeof variants)['main']['colors']

function hex(role: { hex: string }): string {
  return normalizeHex(role.hex, '#000000')
}

function buildColors(c: RoseColors): Record<string, string> {
  return {
    'editor.background': hex(c.base),
    'editor.foreground': hex(c.text),
    'editorLineNumber.foreground': hex(c.muted),
    'editorCursor.foreground': hex(c.love),
    'editor.selectionBackground': hex(c.highlightMed),
    'editor.lineHighlightBackground': hex(c.highlightLow),
    'editorWidget.background': hex(c.surface),
    'editorWidget.border': hex(c.highlightHigh),
    'editorSuggestWidget.background': hex(c.overlay),
    'editorSuggestWidget.border': hex(c.highlightHigh),
    'sideBar.background': hex(c.surface),
    'panel.border': hex(c.highlightHigh),
    focusBorder: hex(c.iris),
    'button.background': hex(c.iris),
    'button.foreground': hex(c.base),
    'button.secondaryBackground': hex(c.overlay),
    'input.background': hex(c.overlay),
    'input.foreground': hex(c.text),
    'input.border': hex(c.highlightHigh),
    'list.hoverBackground': hex(c.highlightLow),
    'list.activeSelectionBackground': hex(c.highlightMed),
    'list.activeSelectionForeground': hex(c.text),
    'textLink.foreground': hex(c.foam),
    'gitDecoration.modifiedResourceForeground': hex(c.gold),
    'gitDecoration.addedResourceForeground': hex(c.foam),
    'gitDecoration.deletedResourceForeground': hex(c.love),
    'gitDecoration.renamedResourceForeground': hex(c.pine),
    errorForeground: hex(c.love),
    'inputValidation.errorBorder': hex(c.love),
    'diffEditor.insertedTextBackground': `${hex(c.foam)}33`,
    'diffEditor.removedTextBackground': `${hex(c.love)}33`,
  }
}

function buildRules(c: RoseColors): editor.ITokenThemeRule[] {
  const fg = (role: { hex: string }) => role.hex
  return [
    { token: '', foreground: fg(c.text) },
    { token: 'comment', foreground: fg(c.muted), fontStyle: 'italic' },
    { token: 'string', foreground: fg(c.gold) },
    { token: 'keyword', foreground: fg(c.pine) },
    { token: 'number', foreground: fg(c.rose) },
    { token: 'regexp', foreground: fg(c.iris) },
    { token: 'type', foreground: fg(c.foam) },
    { token: 'class', foreground: fg(c.foam) },
    { token: 'function', foreground: fg(c.love) },
    { token: 'variable', foreground: fg(c.text) },
    { token: 'variable.predefined', foreground: fg(c.love) },
    { token: 'constant', foreground: fg(c.rose) },
    { token: 'tag', foreground: fg(c.love) },
    { token: 'attribute.name', foreground: fg(c.iris) },
    { token: 'attribute.value', foreground: fg(c.gold) },
    { token: 'delimiter', foreground: fg(c.subtle) },
    { token: 'operator', foreground: fg(c.subtle) },
  ]
}

export function rosePineThemeData(
  variantKey: 'main' | 'moon' | 'dawn',
): { base: MonacoBase; data: editor.IStandaloneThemeData } {
  const v = variants[variantKey]
  const base: MonacoBase = variantKey === 'dawn' ? 'vs' : 'vs-dark'
  return {
    base,
    data: {
      base,
      inherit: true,
      rules: buildRules(v.colors),
      colors: buildColors(v.colors),
    },
  }
}
