import { variants } from '@rose-pine/palette'
import { normalizeHex } from './derive'
import type { ColorScheme } from './tokens'

type RoseColors = (typeof variants)['main']['colors']

function hex(role: { hex: string }): string {
  return normalizeHex(role.hex, '#000000')
}

function buildColors(c: RoseColors): Record<string, string> {
  return {
    'editor.background': hex(c.base),
    'editor.foreground': hex(c.text),
    'editorLineNumber.foreground': hex(c.muted),
    'editorWidget.background': hex(c.surface),
    'editorWidget.border': hex(c.highlightHigh),
    'sideBar.background': hex(c.surface),
    'panel.border': hex(c.highlightHigh),
    focusBorder: hex(c.iris),
    'button.background': hex(c.iris),
    'button.secondaryBackground': hex(c.overlay),
    'input.background': hex(c.overlay),
    'list.hoverBackground': hex(c.highlightLow),
    'list.activeSelectionBackground': hex(c.highlightMed),
    'textLink.foreground': hex(c.foam),
    'gitDecoration.modifiedResourceForeground': hex(c.gold),
    'gitDecoration.addedResourceForeground': hex(c.foam),
    'gitDecoration.deletedResourceForeground': hex(c.love),
    'gitDecoration.renamedResourceForeground': hex(c.pine),
    errorForeground: hex(c.love),
    'inputValidation.errorBorder': hex(c.love),
  }
}

export function rosePineChrome(
  variantKey: 'main' | 'moon' | 'dawn',
): { scheme: ColorScheme; colors: Record<string, string> } {
  const v = variants[variantKey]
  return {
    scheme: variantKey === 'dawn' ? 'light' : 'dark',
    colors: buildColors(v.colors),
  }
}
