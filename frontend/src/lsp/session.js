import { signal } from '@preact/signals';

/**
 * Language-server session manager. One entry per registry server (gopls,
 * typescript, ...), started lazily the first time a file of one of its
 * languages is opened in the active worktree.
 *
 * Server state: idle | starting | indexing | ready | unavailable | error
 *  - starting: spawned, `initialize` handshake in flight
 *  - indexing: initialized but the server reports work-done progress (or has
 *    not yet had a quiet moment); features fall back to text search
 *  - ready: initialized and idle
 *  - unavailable: binary not installed (never auto-retried)
 *  - error: crashed / failed to start (only restarted by an explicit action)
 *
 * @typedef {'idle'|'starting'|'indexing'|'ready'|'unavailable'|'error'} ServerState
 * @typedef {{
 *   id: string, languages: string[], command: string,
 *   state: ServerState, message: string, error: string,
 * }} ServerEntry
 */

export const INSTALL_HINTS = {
  gopls: 'go install golang.org/x/tools/gopls@latest',
  typescript: 'npm i -g typescript-language-server typescript',
  python: 'npm i -g pyright   (or: pip install python-lsp-server)',
  rust: 'rustup component add rust-analyzer',
};

/** Human status for the pill. `serverId` is the display name. */
export function describeEntry(entry) {
  if (!entry) return null;
  const name = entry.id;
  const base = { id: entry.id };

  switch (entry.state) {
    case 'starting':
      return { ...base, tone: 'busy', text: `${name} · starting…`, hint: '' };
    case 'indexing':
      return {
        ...base,
        tone: 'busy',
        text: `${name} · indexing…`,
        hint: entry.message ? `${entry.message} — using text search meanwhile` : 'Using text search meanwhile',
      };
    case 'ready':
      return { ...base, tone: 'ok', text: `${name} · ready`, hint: '' };
    case 'unavailable':
      return {
        ...base,
        tone: 'warn',
        text: `${entry.command || name} not installed — using text search`,
        hint: INSTALL_HINTS[entry.id] ?? '',
      };
    case 'error':
      return {
        ...base,
        tone: 'error',
        text: `${name} stopped — using text search`,
        hint: entry.error,
        restart: true,
      };
    default:
      return null;
  }
}

/**
 * @param {{
 *   api: {
 *     lspServers: () => Promise<any[]>,
 *     lspStart: (id: string) => Promise<any>,
 *     lspSend: (id: string, msg: string) => Promise<any>,
 *     lspStop?: (id: string) => Promise<any>,
 *     onLSPMessage: (fn: (e: { serverId: string, message: string }) => void) => () => void,
 *     onLSPStatus: (fn: (info: any) => void) => () => void,
 *   },
 *   createClient?: (opts: any) => any | Promise<any>,
 *   graceMs?: number,
 *   onDiagnostics?: (serverId: string, uri: string, diagnostics: any[]) => void,
 * }} deps
 */
export function createLspSession({ api, createClient, graceMs = 1200, onDiagnostics }) {
  /** Workspace root path (project path); '' = none. */
  const root = signal('');
  /** serverId -> entry; replaced immutably so effects can depend on the map. */
  const servers = signal(/** @type {Record<string, ServerEntry>} */ ({}));
  /** Bumped when all clients are dropped; views re-open their documents. */
  const epoch = signal(0);

  /** @type {Map<string, any>} */
  const clients = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const graceTimers = new Map();
  /** @type {Set<string>} servers with a start in flight */
  const starting = new Set();
  /** @type {Set<string>} */
  const restarting = new Set();
  let generation = 0;
  /** @type {Promise<void> | null} */
  let registryLoad = null;

  const offMessage = api.onLSPMessage((e) => clients.get(e?.serverId)?.receive(e.message));
  const offStatus = api.onLSPStatus((info) => {
    if (!info) return;
    const entry = servers.peek()[info.id];

    if (!entry) return;

    if (info.status === 'error') {
      dropClient(info.id);
      setEntry(info.id, { state: 'error', error: info.error ?? 'server exited', message: '' });
    } else if (
      info.status === 'stopped' &&
      !restarting.has(info.id) &&
      ['starting', 'indexing', 'ready'].includes(entry.state)
    ) {
      dropClient(info.id);
      setEntry(info.id, { state: 'idle', message: '' });
    }
  });

  function setEntry(id, patch) {
    const cur = servers.peek()[id];

    if (!cur) return;
    servers.value = { ...servers.peek(), [id]: { ...cur, ...patch } };
  }

  function dropClient(id) {
    clearTimeout(graceTimers.get(id));
    graceTimers.delete(id);
    clients.get(id)?.dispose();
    clients.delete(id);
    starting.delete(id);
  }

  function loadRegistry() {
    if (registryLoad) return registryLoad;
    const gen = generation;
    registryLoad = api
      .lspServers()
      .then((list) => {
        if (gen !== generation) return;
        const next = {};

        for (const s of list ?? []) {
          next[s.id] = {
            id: s.id,
            languages: s.languages ?? [],
            command: s.command ?? s.id,
            rootUri: s.rootUri ?? '',
            state: s.available === false ? 'unavailable' : 'idle',
            message: '',
            error: '',
          };
        }

        servers.value = next;
      })
      .catch(() => {
        if (gen === generation) registryLoad = null;
      });

    return registryLoad;
  }

  function scheduleReady(id, gen) {
    clearTimeout(graceTimers.get(id));
    graceTimers.set(
      id,
      setTimeout(() => {
        if (gen !== generation || !clients.has(id)) return;
        const entry = servers.peek()[id];

        if (entry?.state === 'indexing') setEntry(id, { state: 'ready', message: '' });
      }, graceMs)
    );
  }

  async function startServer(id) {
    if (starting.has(id)) return;
    const entry = servers.peek()[id];

    if (!entry || entry.state !== 'idle') return;
    const gen = generation;
    starting.add(id);
    setEntry(id, { state: 'starting', message: '', error: '' });

    try {
      const make = createClient ?? (await import('./client.js')).createLspClient;

      if (gen !== generation) return;
      let rootUri = servers.peek()[id].rootUri;
      const client = await make({
        serverId: id,
        rootUri,
        send: (raw) => api.lspSend(id, raw),
        onProgress: ({ active, title }) => {
          if (gen !== generation || clients.get(id) !== client) return;
          const cur = servers.peek()[id];

          if (!cur || cur.state === 'starting' || cur.state === 'unavailable') return;

          if (active > 0) {
            clearTimeout(graceTimers.get(id));
            setEntry(id, { state: 'indexing', message: title });
          } else {
            scheduleReady(id, gen);
          }
        },
        onDiagnostics: (uri, diagnostics) => onDiagnostics?.(id, uri, diagnostics),
      });
      clients.set(id, client);
      const info = await api.lspStart(id);

      if (gen !== generation) return;

      if (info?.rootUri) {
        rootUri = info.rootUri;
        client.rootUri = rootUri;
      }

      await client.initialize();

      if (gen !== generation || clients.get(id) !== client) return;
      setEntry(id, { state: 'indexing', message: '' });
      scheduleReady(id, gen);
    } catch (err) {
      if (gen !== generation) return;
      const message = err?.message ?? String(err);
      dropClient(id);
      // "not installed" is the backend's spawn error; everything else is a real failure.
      const missing = /not (installed|found)|no such file|executable file/i.test(message);
      setEntry(id, { state: missing ? 'unavailable' : 'error', error: message, message: '' });
    } finally {
      starting.delete(id);
    }
  }

  const session = {
    root,
    servers,
    epoch,

    /** Switch workspace: drop every client (backend already stopped the processes). */
    reset(nextRoot = '') {
      if (nextRoot === root.peek()) return;
      generation += 1;

      for (const id of [...clients.keys()]) dropClient(id);
      registryLoad = null;
      starting.clear();
      servers.value = {};
      root.value = nextRoot;
      epoch.value += 1;
    },

    /** Server entry that handles `languageId`, if the registry has loaded. */
    entryFor(languageId) {
      const all = servers.peek();

      return Object.values(all).find((s) => s.languages.includes(languageId)) ?? null;
    },

    /**
     * Make sure a server for this language is (being) started. Never retries
     * unavailable/error servers. Safe to call repeatedly.
     */
    async ensure(languageId) {
      if (!root.peek()) return;
      const gen = generation;
      await loadRegistry();

      if (gen !== generation) return;
      const entry = session.entryFor(languageId);

      if (entry?.state === 'idle') await startServer(entry.id);
    },

    /** Client usable for document sync (initialized, possibly still indexing). */
    syncClientFor(languageId) {
      const entry = session.entryFor(languageId);

      if (!entry || (entry.state !== 'indexing' && entry.state !== 'ready')) return null;
      const client = clients.get(entry.id);

      return client?.initialized ? client : null;
    },

    /** Client for language features: only once the server is ready. */
    readyClientFor(languageId) {
      const entry = session.entryFor(languageId);

      return entry?.state === 'ready' ? (clients.get(entry.id) ?? null) : null;
    },

    /** Explicit "Restart" after an error (or to force a fresh start). */
    async restart(serverId) {
      const entry = servers.peek()[serverId];

      if (!entry || entry.state === 'unavailable') return;
      restarting.add(serverId);
      dropClient(serverId);
      try {
        await api.lspStop?.(serverId);
      } catch {
        // already gone
      }
      restarting.delete(serverId);
      setEntry(serverId, { state: 'idle', error: '', message: '' });
      await startServer(serverId);
    },

    dispose() {
      generation += 1;

      for (const id of [...clients.keys()]) dropClient(id);
      offMessage();
      offStatus();
    },
  };

  return session;
}
