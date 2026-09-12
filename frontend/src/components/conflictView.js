/**
 * Maps a GetFileContents result for a conflicted path to the viewer state.
 * The worktree side carries the conflict markers; the index side is
 * unavailable for unmerged entries (HasOld is false).
 *
 * @param {string} path
 * @param {{ hasNew?: boolean, newContent?: string }|null|undefined} res
 * @returns {{ loading: boolean, view: { path: string, contents: string } | null }}
 */
export function conflictViewFromContents(path, res) {
  if (!res?.hasNew) return { loading: false, view: null };
  return {
    loading: false,
    view: { path, contents: res.newContent ?? '' },
  };
}
