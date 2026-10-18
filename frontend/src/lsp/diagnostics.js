/** Latest published diagnostics per document URI, with per-URI subscribers. */
export function createDiagnosticsBus() {
  /** @type {Map<string, any[]>} */
  const latest = new Map();
  /** @type {Map<string, Set<(d: any[]) => void>>} */
  const subs = new Map();

  return {
    publish(_serverId, uri, diagnostics) {
      latest.set(uri, diagnostics);

      for (const fn of subs.get(uri) ?? []) fn(diagnostics);
    },

    get: (uri) => latest.get(uri) ?? [],

    /** Subscribe and immediately deliver any cached diagnostics. */
    subscribe(uri, fn) {
      let set = subs.get(uri);

      if (!set) subs.set(uri, (set = new Set()));
      set.add(fn);

      if (latest.has(uri)) fn(latest.get(uri));

      return () => set.delete(fn);
    },

    clear() {
      latest.clear();

      for (const set of subs.values()) for (const fn of set) fn([]);
    },
  };
}
