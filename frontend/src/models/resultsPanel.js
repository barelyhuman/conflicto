import { signal } from '@preact/signals';

/**
 * Bottom panel listing code locations (find references, ambiguous
 * definitions). Reuses the ResultsList component from global search.
 *
 * @typedef {import('./searchModel.js').ResultItem} ResultItem
 * @typedef {{ title: string, items: ResultItem[], loading?: boolean }} ResultsPanelState
 */

export const resultsPanel = signal(/** @type {ResultsPanelState | null} */ (null));

/** @param {ResultsPanelState} state */
export function showResults(state) {
  resultsPanel.value = state;
}

export function closeResults() {
  resultsPanel.value = null;
}
