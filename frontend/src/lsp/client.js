import { createRpc } from './jsonrpc.js';

export const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ['utf-16'] },
  window: { workDoneProgress: true, showMessage: { messageActionItem: { additionalPropertiesSupport: false } } },
  workspace: {
    configuration: true,
    workspaceFolders: true,
    didChangeConfiguration: { dynamicRegistration: false },
    applyEdit: false,
  },
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: true, willSave: false },
    hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
    definition: { dynamicRegistration: false, linkSupport: true },
    references: { dynamicRegistration: false },
    completion: {
      dynamicRegistration: false,
      contextSupport: true,
      completionItem: {
        snippetSupport: false,
        documentationFormat: ['markdown', 'plaintext'],
        resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
      },
    },
    publishDiagnostics: { relatedInformation: false },
  },
};

/** 0 none, 1 full, 2 incremental */
export function syncKindOf(capabilities) {
  const sync = capabilities?.textDocumentSync;

  if (typeof sync === 'number') return sync;

  return sync?.change ?? 1;
}

/**
 * A language-server client over a message transport. Owns the initialize
 * handshake, document sync, server->client requests and progress tracking.
 *
 * @param {{
 *   serverId: string,
 *   rootUri: string,
 *   send: (raw: string) => unknown,
 *   onProgress?: (state: { active: number, title: string }) => void,
 *   onDiagnostics?: (uri: string, diagnostics: any[]) => void,
 * }} opts
 */
export function createLspClient({ serverId, rootUri, send, onProgress, onDiagnostics }) {
  const rpc = createRpc({ send });
  /** @type {any} */
  let capabilities = null;
  let initialized = false;
  let disposed = false;
  /** @type {Map<string, { version: number, languageId: string }>} */
  const docs = new Map();
  /** @type {Map<string | number, string>} */
  const progress = new Map();
  const folder = { uri: rootUri, name: rootUri.slice(rootUri.lastIndexOf('/') + 1) || 'workspace' };

  function reportProgress() {
    const titles = [...progress.values()];
    onProgress?.({ active: titles.length, title: titles[titles.length - 1] ?? '' });
  }

  rpc.onRequest('workspace/configuration', (p) => (p?.items ?? []).map(() => null));
  // Tokens only count as active once `begin` arrives.
  rpc.onRequest('window/workDoneProgress/create', () => null);
  rpc.onRequest('client/registerCapability', () => null);
  rpc.onRequest('client/unregisterCapability', () => null);
  rpc.onRequest('window/showMessageRequest', () => null);
  rpc.onRequest('workspace/workspaceFolders', () => [folder]);
  rpc.onRequest('workspace/applyEdit', () => ({ applied: false }));

  rpc.onNotification('$/progress', (p) => {
    const v = p?.value;

    if (!v || p.token == null) return;

    if (v.kind === 'begin') {
      progress.set(p.token, v.title ?? '');
      reportProgress();
    } else if (v.kind === 'end') {
      if (progress.delete(p.token)) reportProgress();
    }
  });
  rpc.onNotification('textDocument/publishDiagnostics', (p) => {
    if (p?.uri) onDiagnostics?.(p.uri, p.diagnostics ?? []);
  });

  const client = {
    serverId,
    rootUri,
    rpc,

    get capabilities() {
      return capabilities;
    },
    get initialized() {
      return initialized;
    },
    get disposed() {
      return disposed;
    },

    receive: (raw) => rpc.receive(raw),

    async initialize() {
      const result = await rpc.request('initialize', {
        processId: null,
        clientInfo: { name: 'conflicto' },
        rootUri,
        rootPath: null,
        workspaceFolders: [folder],
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: null,
      });

      if (disposed) return null;
      capabilities = result?.capabilities ?? {};
      rpc.notify('initialized', {});
      initialized = true;

      return capabilities;
    },

    hasDoc: (uri) => docs.has(uri),

    openDoc(uri, languageId, text) {
      if (!initialized || docs.has(uri)) return;
      docs.set(uri, { version: 1, languageId });
      rpc.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      });
    },

    /**
     * @param {string} uri
     * @param {{ incremental: () => any[], fullText: () => string }} change
     */
    changeDoc(uri, { incremental, fullText }) {
      const doc = docs.get(uri);

      if (!doc || !initialized) return;
      const kind = syncKindOf(capabilities);

      if (kind === 0) return;
      doc.version += 1;
      rpc.notify('textDocument/didChange', {
        textDocument: { uri, version: doc.version },
        contentChanges: kind === 2 ? incremental() : [{ text: fullText() }],
      });
    },

    saveDoc(uri, text) {
      if (!docs.has(uri) || !initialized) return;
      const save = capabilities?.textDocumentSync?.save;
      const params = { textDocument: { uri } };

      if (save && typeof save === 'object' && save.includeText) params.text = text;
      rpc.notify('textDocument/didSave', params);
    },

    closeDoc(uri) {
      if (!docs.delete(uri) || !initialized) return;
      rpc.notify('textDocument/didClose', { textDocument: { uri } });
    },

    /** @param {string} method @param {unknown} params @param {AbortSignal} [signal] */
    request: (method, params, signal) => rpc.request(method, params, signal),

    hover: (uri, position, signal) =>
      rpc.request('textDocument/hover', { textDocument: { uri }, position }, signal),
    definition: (uri, position, signal) =>
      rpc.request('textDocument/definition', { textDocument: { uri }, position }, signal),
    references: (uri, position, signal) =>
      rpc.request(
        'textDocument/references',
        { textDocument: { uri }, position, context: { includeDeclaration: true } },
        signal
      ),
    completion: (uri, position, context, signal) =>
      rpc.request('textDocument/completion', { textDocument: { uri }, position, context }, signal),
    resolveCompletion: (item, signal) => rpc.request('completionItem/resolve', item, signal),

    dispose() {
      if (disposed) return;
      disposed = true;
      progress.clear();
      docs.clear();
      rpc.dispose();
    },
  };

  return client;
}
