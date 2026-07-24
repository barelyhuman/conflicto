import { deriveUiVars } from './derive'
import { rosePineChrome } from './rosePine'
import type { ColorScheme, ThemeId, UiVars } from './tokens'

export interface ThemePack {
  id: ThemeId
  label: string
  /** Shiki / @pierre/diffs theme name */
  shikiTheme: string
  scheme: ColorScheme
  /** VS Code–style color map used to derive UI chrome vars */
  colors: Record<string, string>
  ui: UiVars
}

function packFromColors(
  id: ThemeId,
  label: string,
  shikiTheme: string,
  scheme: ColorScheme,
  colors: Record<string, string>,
): ThemePack {
  return {
    id,
    label,
    shikiTheme,
    scheme,
    colors,
    ui: deriveUiVars(colors, scheme),
  }
}

const DARK_PLUS_COLORS: Record<string, string> = {
  'editor.background': '#1e1e1e',
  'editor.foreground': '#d4d4d4',
  'editorLineNumber.foreground': '#858585',
  'editorWidget.background': '#252526',
  'editorWidget.border': '#454545',
  'sideBar.background': '#252526',
  'panel.border': '#2b2b2b',
  focusBorder: '#007fd4',
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
  errorForeground: '#f48771',
  'inputValidation.errorBorder': '#f14c4c',
}

const LIGHT_PLUS_COLORS: Record<string, string> = {
  'editor.background': '#ffffff',
  'editor.foreground': '#000000',
  'editorLineNumber.foreground': '#237893',
  'editorWidget.background': '#f3f3f3',
  'editorWidget.border': '#c8c8c8',
  'sideBar.background': '#f3f3f3',
  'panel.border': '#e7e7e7',
  focusBorder: '#0090f1',
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
  errorForeground: '#a1260d',
  'inputValidation.errorBorder': '#e51400',
}

/** Approximate Pierre Dark chrome (syntax comes from Shiki pierre-dark). */
const PIERRE_DARK_COLORS: Record<string, string> = {
  'editor.background': '#1a1a1a',
  'editor.foreground': '#e4e4e7',
  'editorLineNumber.foreground': '#71717a',
  'editorWidget.background': '#222225',
  'editorWidget.border': '#3f3f46',
  'sideBar.background': '#141416',
  'panel.border': '#27272a',
  focusBorder: '#a78bfa',
  'button.background': '#7c3aed',
  'button.secondaryBackground': '#3f3f46',
  'input.background': '#27272a',
  'list.hoverBackground': '#27272a',
  'list.activeSelectionBackground': '#3b2f5a',
  'textLink.foreground': '#c4b5fd',
  'gitDecoration.modifiedResourceForeground': '#fbbf24',
  'gitDecoration.addedResourceForeground': '#4ade80',
  'gitDecoration.deletedResourceForeground': '#f87171',
  'gitDecoration.renamedResourceForeground': '#4ade80',
  errorForeground: '#f87171',
  'inputValidation.errorBorder': '#f87171',
}

/** Approximate Pierre Light chrome (syntax comes from Shiki pierre-light). */
const PIERRE_LIGHT_COLORS: Record<string, string> = {
  'editor.background': '#fafafa',
  'editor.foreground': '#18181b',
  'editorLineNumber.foreground': '#71717a',
  'editorWidget.background': '#f4f4f5',
  'editorWidget.border': '#d4d4d8',
  'sideBar.background': '#f4f4f5',
  'panel.border': '#e4e4e7',
  focusBorder: '#7c3aed',
  'button.background': '#7c3aed',
  'button.secondaryBackground': '#e4e4e7',
  'input.background': '#ffffff',
  'list.hoverBackground': '#ececef',
  'list.activeSelectionBackground': '#ede9fe',
  'textLink.foreground': '#6d28d9',
  'gitDecoration.modifiedResourceForeground': '#a16207',
  'gitDecoration.addedResourceForeground': '#15803d',
  'gitDecoration.deletedResourceForeground': '#b91c1c',
  'gitDecoration.renamedResourceForeground': '#15803d',
  errorForeground: '#b91c1c',
  'inputValidation.errorBorder': '#dc2626',
}

function rosePack(
  id: ThemeId,
  label: string,
  shikiTheme: string,
  variant: 'main' | 'moon' | 'dawn',
): ThemePack {
  const { scheme, colors } = rosePineChrome(variant)
  return packFromColors(id, label, shikiTheme, scheme, colors)
}

export const THEMES: ThemePack[] = [
  packFromColors('pierre-dark', 'Pierre Dark', 'pierre-dark', 'dark', PIERRE_DARK_COLORS),
  packFromColors('pierre-light', 'Pierre Light', 'pierre-light', 'light', PIERRE_LIGHT_COLORS),
  packFromColors('dark-plus', 'Dark+', 'dark-plus', 'dark', DARK_PLUS_COLORS),
  packFromColors('light-plus', 'Light+', 'light-plus', 'light', LIGHT_PLUS_COLORS),
  rosePack('rose-pine', 'Rosé Pine', 'rose-pine', 'main'),
  rosePack('rose-pine-moon', 'Rosé Pine Moon', 'rose-pine-moon', 'moon'),
  rosePack('rose-pine-dawn', 'Rosé Pine Dawn', 'rose-pine-dawn', 'dawn'),
]

export const DEFAULT_THEME_ID: ThemeId = 'pierre-dark'

export function getTheme(id: ThemeId): ThemePack {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
