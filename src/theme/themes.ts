import type { editor } from 'monaco-editor'
import { deriveUiVars } from './derive'
import { rosePineThemeData } from './rosePine'
import type { MonacoBase, ThemeId, UiVars } from './tokens'

export interface ThemePack {
  id: ThemeId
  label: string
  /** Built-in Monaco id, or custom id registered via defineTheme */
  monacoThemeId: string
  base: MonacoBase
  /** Present for custom themes that must be defineTheme'd */
  monacoData?: editor.IStandaloneThemeData
  /** Monaco color map used to derive UI vars (and defineTheme colors) */
  colors: Record<string, string>
  ui: UiVars
}

function packFromColors(
  id: ThemeId,
  label: string,
  monacoThemeId: string,
  base: MonacoBase,
  colors: Record<string, string>,
  monacoData?: editor.IStandaloneThemeData,
): ThemePack {
  return {
    id,
    label,
    monacoThemeId,
    base,
    colors,
    monacoData,
    ui: deriveUiVars(colors, base),
  }
}

/** Known Monaco default palette excerpts for deriving chrome vars. */
const VS_DARK_COLORS: Record<string, string> = {
  'editor.background': '#1e1e1e',
  'editor.foreground': '#d4d4d4',
  'editorLineNumber.foreground': '#858585',
  'editorWidget.background': '#252526',
  'editorWidget.border': '#454545',
  'sideBar.background': '#252526',
  'panel.border': '#2b2b2b',
  'focusBorder': '#007fd4',
  'button.background': '#0e639c',
  'button.secondaryBackground': '#3c3c3c',
  'input.background': '#3c3c3c',
  'list.hoverBackground': '#2a2d2e',
  'list.activeSelectionBackground': '#094771',
  'textLink.foreground': '#3794ff',
  'gitDecoration.modifiedResourceForeground': '#e2c08d',
  'gitDecoration.addedResourceForeground': '#73c991',
  'gitDecoration.deletedResourceForeground': '#f14c4c',
  'gitDecoration.renamedResourceForeground': '#73c991',
  'errorForeground': '#f48771',
  'inputValidation.errorBorder': '#f14c4c',
}

const VS_COLORS: Record<string, string> = {
  'editor.background': '#ffffff',
  'editor.foreground': '#000000',
  'editorLineNumber.foreground': '#237893',
  'editorWidget.background': '#f3f3f3',
  'editorWidget.border': '#c8c8c8',
  'sideBar.background': '#f3f3f3',
  'panel.border': '#e7e7e7',
  'focusBorder': '#0090f1',
  'button.background': '#0078d4',
  'button.secondaryBackground': '#eeeeee',
  'input.background': '#ffffff',
  'list.hoverBackground': '#e8e8e8',
  'list.activeSelectionBackground': '#add6ff',
  'textLink.foreground': '#006ab1',
  'gitDecoration.modifiedResourceForeground': '#895503',
  'gitDecoration.addedResourceForeground': '#3a7a10',
  'gitDecoration.deletedResourceForeground': '#ad0707',
  'gitDecoration.renamedResourceForeground': '#3a7a10',
  'errorForeground': '#a1260d',
  'inputValidation.errorBorder': '#e51400',
}

const HC_BLACK_COLORS: Record<string, string> = {
  'editor.background': '#000000',
  'editor.foreground': '#ffffff',
  'editorLineNumber.foreground': '#ffffff',
  'editorWidget.background': '#0c141f',
  'editorWidget.border': '#6fc3df',
  'sideBar.background': '#000000',
  'panel.border': '#6fc3df',
  'focusBorder': '#f38518',
  'button.background': '#0e639c',
  'button.secondaryBackground': '#000000',
  'input.background': '#000000',
  'list.hoverBackground': '#0c141f',
  'list.activeSelectionBackground': '#0c141f',
  'textLink.foreground': '#3794ff',
  'gitDecoration.modifiedResourceForeground': '#e2c08d',
  'gitDecoration.addedResourceForeground': '#73c991',
  'gitDecoration.deletedResourceForeground': '#f14c4c',
  'gitDecoration.renamedResourceForeground': '#73c991',
  'errorForeground': '#f48771',
  'inputValidation.errorBorder': '#f48771',
}

function rosePack(
  id: ThemeId,
  label: string,
  variant: 'main' | 'moon' | 'dawn',
): ThemePack {
  const { base, data } = rosePineThemeData(variant)
  return packFromColors(id, label, id, base, data.colors as Record<string, string>, data)
}

export const THEMES: ThemePack[] = [
  packFromColors('vs-dark', 'Dark', 'vs-dark', 'vs-dark', VS_DARK_COLORS),
  packFromColors('vs', 'Light', 'vs', 'vs', VS_COLORS),
  packFromColors('hc-black', 'High Contrast', 'hc-black', 'hc-black', HC_BLACK_COLORS),
  rosePack('rose-pine', 'Rosé Pine', 'main'),
  rosePack('rose-pine-moon', 'Rosé Pine Moon', 'moon'),
  rosePack('rose-pine-dawn', 'Rosé Pine Dawn', 'dawn'),
]

export const DEFAULT_THEME_ID: ThemeId = 'vs-dark'

export function getTheme(id: ThemeId): ThemePack {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
