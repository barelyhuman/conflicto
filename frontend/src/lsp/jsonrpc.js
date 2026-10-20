/**
 * Minimal JSON-RPC 2.0 peer over an opaque message transport. The backend
 * frames messages, so `send` takes one raw JSON string and `receive` is fed
 * one raw JSON string at a time.
 */

export const REQUEST_CANCELLED = -32800;
export const METHOD_NOT_FOUND = -32601;

export class RpcError extends Error {
  /** @param {number} code @param {string} message @param {unknown} [data] */
  constructor(code, message, data) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

/**
 * @param {{ send: (raw: string) => unknown }} opts
 */
export function createRpc({ send }) {
  let nextId = 1;
  /** @type {Map<number | string, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(params: any) => void>>} */
  const notificationHandlers = new Map();
  /** @type {Map<string, (params: any) => unknown>} */
  const requestHandlers = new Map();
  let disposed = false;

  function post(message) {
    if (disposed) return;

    try {
      const r = send(JSON.stringify({ jsonrpc: '2.0', ...message }));

      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // transport errors surface as the server dying (status event)
    }
  }

  return {
    /**
     * @param {string} method
     * @param {unknown} [params]
     * @param {AbortSignal} [signal] aborting sends $/cancelRequest and rejects
     * @returns {Promise<any>}
     */
    request(method, params, signal) {
      if (disposed) return Promise.reject(new RpcError(REQUEST_CANCELLED, 'disposed'));
      const id = nextId++;

      return new Promise((resolve, reject) => {
        const onAbort = () => {
          if (!pending.delete(id)) return;
          post({ method: '$/cancelRequest', params: { id } });
          reject(new RpcError(REQUEST_CANCELLED, 'cancelled'));
        };

        if (signal?.aborted) {
          reject(new RpcError(REQUEST_CANCELLED, 'cancelled'));

          return;
        }

        pending.set(id, {
          resolve: (v) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(v);
          },
          reject: (e) => {
            signal?.removeEventListener('abort', onAbort);
            reject(e);
          },
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        post({ id, method, params });
      });
    },

    notify(method, params) {
      post({ method, params });
    },

    /** @returns {() => void} unsubscribe */
    onNotification(method, fn) {
      let set = notificationHandlers.get(method);

      if (!set) notificationHandlers.set(method, (set = new Set()));
      set.add(fn);

      return () => set.delete(fn);
    },

    /** Handler returns the result (or throws RpcError / Error for an error response). */
    onRequest(method, fn) {
      requestHandlers.set(method, fn);
    },

    /** Feed one raw message from the server. */
    receive(raw) {
      let msg;

      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (!msg || typeof msg !== 'object') return;
      const hasMethod = typeof msg.method === 'string';

      if (!hasMethod && msg.id != null) {
        const p = pending.get(msg.id);

        if (!p) return;
        pending.delete(msg.id);

        if (msg.error) p.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
        else p.resolve(msg.result ?? null);

        return;
      }

      if (!hasMethod) return;

      if (msg.id == null) {
        for (const fn of notificationHandlers.get(msg.method) ?? []) {
          try {
            fn(msg.params);
          } catch {
            // one bad handler must not break others
          }
        }

        return;
      }

      const handler = requestHandlers.get(msg.method);

      if (!handler) {
        post({ id: msg.id, error: { code: METHOD_NOT_FOUND, message: `Unhandled ${msg.method}` } });

        return;
      }

      Promise.resolve()
        .then(() => handler(msg.params))
        .then(
          (result) => post({ id: msg.id, result: result ?? null }),
          (err) =>
            post({
              id: msg.id,
              error: { code: err?.code ?? -32603, message: err?.message ?? 'error' },
            })
        );
    },

    get pendingCount() {
      return pending.size;
    },

    dispose() {
      disposed = true;

      for (const p of pending.values()) p.reject(new RpcError(REQUEST_CANCELLED, 'disposed'));
      pending.clear();
      notificationHandlers.clear();
    },
  };
}
