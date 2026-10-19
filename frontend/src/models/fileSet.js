/**
 * One changed-file list plus the patch of the file on screen.
 * PR tabs and compare tabs both hold this record; the fetch that fills a
 * patch stays in the model that owns the backend call.
 *
 * @typedef {{ path: string, status?: string, additions?: number, deletions?: number, oldPath?: string, untracked?: boolean }} FileEntry
 * @typedef {{ path?: string, patch?: string }} Patch
 * @typedef {{
 *   list: FileEntry[],
 *   selected: string | null,
 *   patches: Record<string, Patch>,
 *   loading: string | null,
 * }} FileSet
 */

/** @returns {FileSet} */
export function emptyFileSet() {
  return { list: [], selected: null, patches: {}, loading: null };
}

/** @param {FileSet} set */
export function fileIndex(set) {
  return set.list.findIndex((f) => f.path === set.selected);
}

/** Patch of the selected file, or null when it has not arrived. @param {FileSet} set */
export function activePatch(set) {
  const path = set.selected;

  return path ? (set.patches[path] ?? null) : null;
}

/**
 * The selected file's patch request is in flight and nothing is stored for it yet.
 * A stored patch stays on screen while a later request replaces it.
 * @param {FileSet} set
 */
export function patchPending(set) {
  return set.selected != null && set.loading === set.selected && !set.patches[set.selected];
}

/**
 * Path `delta` steps from `selected`, wrapping. Null when the list is empty.
 * @param {FileEntry[]} list
 * @param {string | null} selected
 * @param {number} delta
 */
export function stepPath(list, selected, delta) {
  if (list.length === 0) return null;
  const idx = list.findIndex((f) => f.path === selected);
  const at = idx < 0 ? (delta > 0 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length;

  return list[at].path;
}

/**
 * Replace the list. Keep the selection when that path is still present;
 * otherwise the first file, or null.
 * @param {FileSet} set
 * @param {FileEntry[]} list
 * @returns {FileSet}
 */
export function withList(set, list) {
  const selected = set.selected && list.some((f) => f.path === set.selected) ? set.selected : (list[0]?.path ?? null);

  return { ...set, list, selected };
}

/**
 * Drop stored patches. `keep` retains one path so a refresh can leave it up.
 * @param {FileSet} set
 * @param {string | null} [keep]
 * @returns {FileSet}
 */
export function dropPatches(set, keep = null) {
  const patches = keep && set.patches[keep] ? { [keep]: set.patches[keep] } : {};

  return { ...set, patches, loading: null };
}

/** @param {FileSet} set @param {string} path @returns {FileSet} */
export function beginPatch(set, path) {
  return { ...set, selected: path, loading: path };
}

/** @param {FileSet} set @param {string} path @param {Patch} patch @returns {FileSet} */
export function putPatch(set, path, patch) {
  return {
    ...set,
    patches: { ...set.patches, [path]: patch },
    loading: set.loading === path ? null : set.loading,
  };
}

/** @param {FileSet} set @param {string} path @returns {FileSet} */
export function endPatch(set, path) {
  if (set.loading !== path) return set;

  return { ...set, loading: null };
}
