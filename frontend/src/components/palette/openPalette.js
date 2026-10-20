/** Ask the command palette to open (same effect as the Cmd/Ctrl+K shortcut). */
export const OPEN_PALETTE_EVENT = 'conflicto:open-palette';

export function openPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
