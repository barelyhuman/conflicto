import { createModel, signal } from '@preact/signals';
import { api as defaultApi } from '../wails.js';

/**
 * @typedef {{
 *   kind: 'repo' | 'worktree' | 'pr', id: string, title: string, subtitle: string,
 *   repoPath: string, repoName: string, path: string, prNumber: number,
 *   prState: string, branch: string, hasWorktree: boolean, stale: boolean,
 *   active: boolean, updatedAt: string,
 * }} WorkspaceEntry
 */

/**
 * Workspace index: one list of repos, PRs and worktrees (backed by Go's cached index).
 *
 * @param {{
 *   onError?: (title: string, message: string) => void,
 *   api?: typeof defaultApi,
 * }} [opts]
 */
export const WorkspaceIndexModel = createModel(({ onError, api = defaultApi } = {}) => {
  const entries = signal(/** @type {WorkspaceEntry[]} */ ([]));
  const loading = signal(false);
  /** Id currently being opened ('' when idle). */
  const opening = signal('');

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  return {
    entries,
    loading,
    opening,

    /** Mirror `workspace:index-updated` from Go. */
    applyIndex(data) {
      this.entries.value = Array.isArray(data) ? data : [];
    },

    /** Load the cached index and ask Go to refresh in the background. */
    async refresh() {
      this.loading.value = true;

      try {
        this.applyIndex(await api.getWorkspaceIndex());
        // Result arrives via the index-updated event; don't block on it.
        Promise.resolve(api.refreshWorkspaceIndex()).catch(() => {});
      } catch (err) {
        report('Workspace Error', err);
      } finally {
        this.loading.value = false;
      }
    },

    /** @returns {Promise<boolean>} true when the workspace was opened. */
    async open(id) {
      if (!id || this.opening.value) return false;
      this.opening.value = id;

      try {
        await api.openWorkspace(id);

        return true;
      } catch (err) {
        report('Open Workspace Error', err);

        return false;
      } finally {
        this.opening.value = '';
      }
    },
  };
});
