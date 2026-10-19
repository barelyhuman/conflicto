import { effect, untracked } from '@preact/signals';
import { sectionForMode } from './tabs.js';

/**
 * Tabs drive selection: when the active tab is a diff tab, point the
 * selection model (which owns diff fetching and the shared DiffViewer /
 * ConflictViewer data) at that tab's file + section. File tabs leave the
 * selection alone.
 *
 * @param {{
 *   tabs: InstanceType<typeof import('./tabs.js').TabsModel>,
 *   selection: InstanceType<typeof import('./selection.js').SelectionModel>,
 * }} deps
 * @returns {() => void} dispose
 */
export function bindTabsToSelection({ tabs, selection }) {
  return effect(() => {
    const tab = tabs.activeTab.value;
    // Tracked on purpose: if something clears the selection while a diff tab
    // is active, the selection is re-pointed at that tab.
    const file = selection.activeFile.value;
    const current = selection.activeSection.value;

    if (!tab) {
      if (file) untracked(() => selection.clear());

      return;
    }

    if (tab.kind !== 'diff') return;
    const section = sectionForMode(tab.mode);

    if (file === tab.path && current === section) return;

    untracked(() => selection.select(tab.path, section));
  });
}

/**
 * Which file the left change list should highlight for the active tab.
 * Diff tabs highlight only inside their own section; file tabs highlight the
 * path wherever it is listed.
 *
 * @param {import('./tabs.js').Tab | null} tab
 * @param {string} section 'conflict' | 'staged' | 'unstaged'
 * @returns {string | null}
 */
export function highlightedPath(tab, section) {
  if (!tab) return null;

  if (tab.kind === 'file') return tab.path;

  if (tab.kind !== 'diff') return null;

  return sectionForMode(tab.mode) === section ? tab.path : null;
}
