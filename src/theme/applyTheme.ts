import { UI_VAR_NAMES, type ThemeId } from './tokens'
import { DEFAULT_THEME_ID, getTheme } from './themes'

export function applyCssVars(id: ThemeId): string {
  const pack = getTheme(id)
  const root = document.documentElement
  root.dataset.theme = pack.id
  root.style.colorScheme = pack.scheme
  for (const name of UI_VAR_NAMES) {
    root.style.setProperty(name, pack.ui[name])
  }
  return pack.ui['--bg']
}

export async function applyTheme(id: ThemeId = DEFAULT_THEME_ID): Promise<void> {
  const bg = applyCssVars(id)
  try {
    await window.conflicto?.setChromeColor?.(bg)
  } catch {
    // Main process may not be ready in pure browser preview
  }
}
