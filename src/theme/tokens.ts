export const UI_VAR_NAMES = [
  '--bg',
  '--bg-sidebar',
  '--bg-surface',
  '--bg-hover',
  '--bg-active',
  '--border',
  '--text',
  '--text-muted',
  '--accent',
  '--accent-hover',
  '--btn-bg',
  '--btn-hover',
  '--btn-fg',
  '--status-m',
  '--status-a',
  '--status-d',
  '--status-r',
  '--danger-bg',
  '--danger-border',
  '--danger-fg',
  '--ref-fg',
  '--ref-bg',
] as const

export type UiVarName = (typeof UI_VAR_NAMES)[number]

export type UiVars = Record<UiVarName, string>

export type ColorScheme = 'light' | 'dark'

export type ThemeId =
  | 'pierre-dark'
  | 'pierre-light'
  | 'dark-plus'
  | 'light-plus'
  | 'rose-pine'
  | 'rose-pine-moon'
  | 'rose-pine-dawn'
