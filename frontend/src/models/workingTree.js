import { createModel, signal } from '@preact/signals';
import { api } from '../wails.js';

/**
 * Working-tree domain: staged / unstaged / conflicts + git mutate actions.
 *
 * @param {{ onError?: (title: string, message: string) => void }} [opts]
 */
export const WorkingTreeModel = createModel(({ onError } = {}) => {
  const staged = signal([]);
  const unstaged = signal([]);
  const conflicts = signal([]);

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  return {
    staged,
    unstaged,
    conflicts,

    /** Mirror `fileStatusChanged` from Go. */
    applyStatus(data) {
      this.staged.value = data?.staged ?? [];
      this.unstaged.value = data?.unstaged ?? [];
      this.conflicts.value = data?.conflicts ?? [];
    },

    /** First file across conflicts → staged → unstaged, or null. */
    firstEntry() {
      const c = this.conflicts.value;
      const s = this.staged.value;
      const u = this.unstaged.value;
      if (c[0]) return { path: c[0].path, section: /** @type {const} */ ('conflict') };
      if (s[0]) return { path: s[0].path, section: /** @type {const} */ ('staged') };
      if (u[0]) return { path: u[0].path, section: /** @type {const} */ ('unstaged') };
      return null;
    },

    stage(path) {
      return api.stageFile(path).catch((err) => {
        report('Stage Error', err);
      });
    },

    unstage(path) {
      return api.unstageFile(path).catch((err) => {
        report('Unstage Error', err);
      });
    },

    discard(path) {
      return api.discardFile(path).catch((err) => {
        report('Discard Error', err);
      });
    },

    async discardAll() {
      const paths = this.unstaged.value.map((f) => f.path);
      for (const path of paths) {
        try {
          await api.discardFile(path);
        } catch (err) {
          report('Discard Error', err);
          break;
        }
      }
    },

    async stageAll() {
      const paths = this.unstaged.value.map((f) => f.path);
      for (const path of paths) {
        try {
          await api.stageFile(path);
        } catch (err) {
          report('Stage Error', err);
          break;
        }
      }
    },

    async unstageAll() {
      const paths = this.staged.value.map((f) => f.path);
      for (const path of paths) {
        try {
          await api.unstageFile(path);
        } catch (err) {
          report('Unstage Error', err);
          break;
        }
      }
    },

    async commit(message) {
      try {
        await api.commit(message.trim());
      } catch (err) {
        report('Commit Error', err);
        throw err;
      }
    },
  };
});
