import { createModel, signal } from '@preact/signals';
import { api } from '../wails.js';

/**
 * Sync domain: ahead/behind counts + async push/pull/fetch actions.
 *
 * @param {{ onError?: (title: string, message: string) => void }} [opts]
 */
export const SyncModel = createModel(({ onError } = {}) => {
  const behind = signal(0);
  const ahead = signal(0);
  const isPulling = signal(false);
  const isPushing = signal(false);
  const isFetching = signal(false);

  function report(title, err) {
    onError?.(title, err?.message ?? String(err));
  }

  return {
    behind,
    ahead,
    isPulling,
    isPushing,
    isFetching,

    setAheadBehind(data) {
      this.behind.value = data?.behind ?? 0;
      this.ahead.value = data?.ahead ?? 0;
    },

    async pull() {
      if (this.isPulling.value) return;
      this.isPulling.value = true;
      try {
        await api.pull();
      } catch (err) {
        report('Pull Error', err);
      } finally {
        this.isPulling.value = false;
      }
    },

    async push() {
      if (this.isPushing.value) return;
      this.isPushing.value = true;
      try {
        await api.push();
      } catch (err) {
        report('Push Error', err);
      } finally {
        this.isPushing.value = false;
      }
    },

    async fetch() {
      if (this.isFetching.value) return;
      this.isFetching.value = true;
      try {
        await api.fetch();
      } catch (err) {
        report('Fetch Error', err);
      } finally {
        this.isFetching.value = false;
      }
    },
  };
});
