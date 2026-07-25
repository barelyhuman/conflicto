import type { ColorScheme, UiVars } from './tokens'

/** Ensure #rrggbb (CSS vars need #). */
export function normalizeHex(color: string | undefined, fallback: string): string {
  if (!color) return fallback
  const c = color.trim()
  if (c.startsWith('#')) return c.length === 4 ? expandShortHex(c) : c.slice(0, 7)
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`
  if (/^[0-9a-fA-F]{3}$/.test(c)) return expandShortHex(`#${c}`)
  return fallback
}

function expandShortHex(short: string): string {
  const r = short[1]
  const g = short[2]
  const b = short[3]
  return `#${r}${r}${g}${g}${b}${b}`
}

function parseRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex, '#000000').slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Mix `a` toward `b` by t in [0,1]. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseRgb(a)
  const [br, bg, bb] = parseRgb(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

export function lighten(hex: string, t: number): string {
  return mix(hex, '#ffffff', t)
}

export function darken(hex: string, t: number): string {
  return mix(hex, '#000000', t)
}

type ColorMap = Record<string, string>

/**
 * Map VS Code–style workbench/editor colors into Conflicto UI CSS variables.
 * Missing keys are derived from background/foreground so every theme stays complete.
 */
export function deriveUiVars(colors: ColorMap, scheme: ColorScheme): UiVars {
  const isLight = scheme === 'light'
  const bg = normalizeHex(colors['editor.background'], isLight ? '#ffffff' : '#1e1e1e')
  const fg = normalizeHex(colors['editor.foreground'], isLight ? '#000000' : '#cccccc')
  const sidebar = normalizeHex(
    colors['sideBar.background'] ?? colors['editorWidget.background'],
    isLight ? darken(bg, 0.03) : lighten(bg, 0.04),
  )
  const surfaceFallback = isLight ? darken(bg, 0.04) : lighten(bg, 0.06)
  let surface = normalizeHex(
    colors['editorWidget.background'] ?? colors['panel.background'],
    surfaceFallback,
  )
  // Keep chrome strips readable when widget bg matches sidebar or editor.
  if (surface.toLowerCase() === bg.toLowerCase() || surface.toLowerCase() === sidebar.toLowerCase()) {
    surface = isLight ? darken(sidebar, 0.04) : lighten(sidebar, 0.05)
    if (surface.toLowerCase() === sidebar.toLowerCase() || surface.toLowerCase() === bg.toLowerCase()) {
      surface = isLight ? darken(bg, 0.06) : lighten(bg, 0.08)
    }
  }
  const border = normalizeHex(
    colors['editorWidget.border'] ?? colors['panel.border'],
    isLight ? darken(bg, 0.12) : lighten(bg, 0.12),
  )
  const muted = normalizeHex(colors['editorLineNumber.foreground'], mix(fg, bg, 0.45))
  const accent = normalizeHex(colors['focusBorder'] ?? colors['button.background'], '#0078d4')
  const accentHover = lighten(accent, isLight ? 0.08 : 0.12)
  const btnBg = normalizeHex(
    colors['button.secondaryBackground'] ?? colors['input.background'],
    isLight ? darken(bg, 0.06) : lighten(bg, 0.1),
  )
  const btnHover = isLight ? darken(btnBg, 0.08) : lighten(btnBg, 0.08)
  const hover = normalizeHex(colors['list.hoverBackground'], mix(bg, fg, isLight ? 0.06 : 0.08))
  const active = normalizeHex(colors['list.activeSelectionBackground'], mix(bg, fg, isLight ? 0.1 : 0.14))

  const statusM = normalizeHex(colors['gitDecoration.modifiedResourceForeground'], '#e2c08d')
  const statusA = normalizeHex(colors['gitDecoration.addedResourceForeground'], '#73c991')
  const statusD = normalizeHex(colors['gitDecoration.deletedResourceForeground'], '#f14c4c')
  const statusR = normalizeHex(colors['gitDecoration.renamedResourceForeground'], statusA)

  const dangerBorder = normalizeHex(colors['errorForeground'] ?? colors['inputValidation.errorBorder'], '#f14c4c')
  const dangerBg = mix(bg, dangerBorder, isLight ? 0.12 : 0.28)
  const dangerFg = isLight ? darken(dangerBorder, 0.25) : lighten(dangerBorder, 0.35)

  const refFg = normalizeHex(colors['textLink.foreground'], accentHover)
  const refBg = mix(bg, accent, isLight ? 0.12 : 0.22)

  return {
    '--bg': bg,
    '--bg-sidebar': sidebar,
    '--bg-surface': surface,
    '--bg-hover': hover,
    '--bg-active': active,
    '--border': border,
    '--text': fg,
    '--text-muted': muted,
    '--accent': accent,
    '--accent-hover': accentHover,
    '--btn-bg': btnBg,
    '--btn-hover': btnHover,
    '--btn-fg': '#ffffff',
    '--status-m': statusM,
    '--status-a': statusA,
    '--status-d': statusD,
    '--status-r': statusR,
    '--danger-bg': dangerBg,
    '--danger-border': dangerBorder,
    '--danger-fg': dangerFg,
    '--ref-fg': refFg,
    '--ref-bg': refBg,
  }
}
