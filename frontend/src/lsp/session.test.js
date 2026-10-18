import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLspSession, describeEntry } from './session.js';
import { createLspClient } from './client.js';

const ROOT = 'file:///work/repo';

/** In-memory backend + language server speaking raw JSON-RPC strings. */
function fakeBackend({ available = true, startError = null, capabilities = {} } = {}) {
  const messageListeners = new Set();
  const statusListeners = new Set();
  const fromClient = [];
  const state = { started: 0, stopped: 0 };
  const emit = (serverId, msg) =>
    messageListeners.forEach((fn) => fn({ serverId, message: JSON.stringify(msg) }));

  const api = {
    lspServers: vi.fn(async () => [
      {
        id: 'gopls',
        languages: ['go', 'gomod'],
        command: 'gopls',
        available,
        status: 'stopped',
        rootUri: ROOT,
      },
    ]),
    lspStart: vi.fn(async (id) => {
      if (startError) throw new Error(startError);
      state.started++;

      return { id, status: 'running', rootUri: ROOT };
    }),
    lspStop: vi.fn(async () => {
      state.stopped++;
    }),
    lspSend: vi.fn(async (id, raw) => {
      const msg = JSON.parse(raw);
      fromClient.push(msg);

      if (msg.method === 'initialize') {
        queueMicrotask(() =>
          emit(id, { jsonrpc: '2.0', id: msg.id, result: { capabilities: { textDocumentSync: 2, ...capabilities } } })
        );
      }
    }),
    onLSPMessage: (fn) => {
      messageListeners.add(fn);

      return () => messageListeners.delete(fn);
    },
    onLSPStatus: (fn) => {
      statusListeners.add(fn);

      return () => statusListeners.delete(fn);
    },
  };

  return {
    api,
    fromClient,
    state,
    emit,
    status: (info) => statusListeners.forEach((fn) => fn(info)),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('lsp session', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function boot(opts) {
    const backend = fakeBackend(opts);
    const session = createLspSession({
      api: backend.api,
      createClient: (o) => createLspClient(o),
      graceMs: 500,
    });
    session.reset('/work/repo');
    await session.ensure('go');
    await flush();

    return { backend, session };
  }

  it('does nothing without a workspace and never starts for unsupported languages', async () => {
    const backend = fakeBackend();
    const session = createLspSession({ api: backend.api, graceMs: 10 });
    await session.ensure('go');
    expect(backend.api.lspServers).not.toHaveBeenCalled();
    session.reset('/work/repo');
    await session.ensure('cobol');
    expect(backend.api.lspStart).not.toHaveBeenCalled();
  });

  it('performs the initialize handshake, then indexing -> ready after the grace period', async () => {
    const { backend, session } = await boot();
    const methods = backend.fromClient.map((m) => m.method);
    expect(methods.slice(0, 2)).toEqual(['initialize', 'initialized']);
    const init = backend.fromClient[0];
    expect(init.params.rootUri).toBe(ROOT);
    expect(init.params.capabilities.textDocument.hover.contentFormat).toContain('markdown');
    expect(init.params.capabilities.textDocument.completion.completionItem.snippetSupport).toBe(false);
    expect(session.servers.value.gopls.state).toBe('indexing');
    expect(session.readyClientFor('go')).toBeNull();
    expect(session.syncClientFor('go')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(600);
    expect(session.servers.value.gopls.state).toBe('ready');
    expect(session.readyClientFor('go')).not.toBeNull();
    expect(describeEntry(session.servers.value.gopls).text).toBe('gopls · ready');
  });

  it('tracks workDoneProgress as indexing and answers server-initiated requests', async () => {
    const { backend, session } = await boot();
    await vi.advanceTimersByTimeAsync(600);
    expect(session.servers.value.gopls.state).toBe('ready');

    backend.emit('gopls', { id: 'a', method: 'window/workDoneProgress/create', params: { token: 't' } });
    backend.emit('gopls', { id: 'b', method: 'workspace/configuration', params: { items: [{}, {}] } });
    backend.emit('gopls', { id: 'c', method: 'client/registerCapability', params: { registrations: [] } });
    await flush();
    const reply = (id) => backend.fromClient.find((m) => m.id === id);
    expect(reply('a').result).toBeNull();
    expect(reply('b').result).toEqual([null, null]);
    expect(reply('c').result).toBeNull();

    backend.emit('gopls', {
      method: '$/progress',
      params: { token: 't', value: { kind: 'begin', title: 'Indexing' } },
    });
    expect(session.servers.value.gopls.state).toBe('indexing');
    expect(session.servers.value.gopls.message).toBe('Indexing');
    expect(session.readyClientFor('go')).toBeNull();
    expect(describeEntry(session.servers.value.gopls).text).toBe('gopls · indexing…');

    backend.emit('gopls', { method: '$/progress', params: { token: 't', value: { kind: 'end' } } });
    expect(session.servers.value.gopls.state).toBe('indexing');
    await vi.advanceTimersByTimeAsync(600);
    expect(session.servers.value.gopls.state).toBe('ready');
  });

  it('matches request/response through the client', async () => {
    const { backend, session } = await boot();
    await vi.advanceTimersByTimeAsync(600);
    const client = session.readyClientFor('go');
    const p = client.definition('file:///work/repo/a.go', { line: 1, character: 2 });
    await flush();
    const req = backend.fromClient.find((m) => m.method === 'textDocument/definition');
    expect(req.params.position).toEqual({ line: 1, character: 2 });
    backend.emit('gopls', { id: req.id, result: [{ uri: 'file:///work/repo/b.go', range: {} }] });
    await expect(p).resolves.toHaveLength(1);
  });

  it('syncs documents: didOpen, incremental didChange, didSave, didClose', async () => {
    const { backend, session } = await boot();
    const client = session.syncClientFor('go');
    const uri = 'file:///work/repo/a.go';
    client.openDoc(uri, 'go', 'package a\n');
    client.openDoc(uri, 'go', 'dupe'); // ignored
    client.changeDoc(uri, { incremental: () => [{ range: {}, text: 'x' }], fullText: () => 'full' });
    client.saveDoc(uri, 'full');
    client.closeDoc(uri);
    await flush();
    const sent = backend.fromClient.filter((m) => m.method?.startsWith('textDocument/'));
    expect(sent.map((m) => m.method)).toEqual([
      'textDocument/didOpen',
      'textDocument/didChange',
      'textDocument/didSave',
      'textDocument/didClose',
    ]);
    expect(sent[0].params.textDocument).toMatchObject({ uri, languageId: 'go', version: 1 });
    expect(sent[1].params.textDocument.version).toBe(2);
    expect(sent[1].params.contentChanges).toEqual([{ range: {}, text: 'x' }]);
  });

  it('falls back to full-text sync when the server asks for it', async () => {
    const { backend, session } = await boot({ capabilities: { textDocumentSync: 1 } });
    const client = session.syncClientFor('go');
    client.openDoc('file:///work/repo/a.go', 'go', 'a');
    client.changeDoc('file:///work/repo/a.go', { incremental: () => [], fullText: () => 'ab' });
    await flush();
    const change = backend.fromClient.find((m) => m.method === 'textDocument/didChange');
    expect(change.params.contentChanges).toEqual([{ text: 'ab' }]);
  });

  it('reports unavailable servers and does not try to start them', async () => {
    const { backend, session } = await boot({ available: false });
    expect(backend.api.lspStart).not.toHaveBeenCalled();
    const entry = session.servers.value.gopls;
    expect(entry.state).toBe('unavailable');
    expect(describeEntry(entry).text).toBe('gopls not installed — using text search');
    expect(describeEntry(entry).hint).toContain('go install');
    await session.ensure('go');
    expect(backend.api.lspStart).not.toHaveBeenCalled();
  });

  it('marks a failed start as error and only restarts explicitly', async () => {
    const { backend, session } = await boot({ startError: 'boom' });
    expect(session.servers.value.gopls.state).toBe('error');
    await session.ensure('go');
    expect(backend.api.lspStart).toHaveBeenCalledTimes(1);
  });

  it('shows a crash (status error) with Restart and restarts on demand', async () => {
    const { backend, session } = await boot();
    await vi.advanceTimersByTimeAsync(600);
    backend.status({ id: 'gopls', status: 'error', error: 'panic: oops' });
    const entry = session.servers.value.gopls;
    expect(entry.state).toBe('error');
    expect(session.syncClientFor('go')).toBeNull();
    const d = describeEntry(entry);
    expect(d.restart).toBe(true);
    expect(d.hint).toBe('panic: oops');

    // not an auto-loop
    await session.ensure('go');
    expect(backend.state.started).toBe(1);

    await session.restart('gopls');
    await flush();
    expect(backend.state.started).toBe(2);
    expect(session.servers.value.gopls.state).toBe('indexing');
  });

  it('drops all client state on project switch and re-starts lazily', async () => {
    const { backend, session } = await boot();
    await vi.advanceTimersByTimeAsync(600);
    const oldClient = session.readyClientFor('go');
    const epoch = session.epoch.value;

    session.reset('/work/other');
    expect(oldClient.disposed).toBe(true);
    expect(session.servers.value).toEqual({});
    expect(session.readyClientFor('go')).toBeNull();
    expect(session.root.value).toBe('/work/other');
    expect(session.epoch.value).toBe(epoch + 1);
    // reset is idempotent for the same root
    session.reset('/work/other');
    expect(session.epoch.value).toBe(epoch + 1);

    // messages from the old process no longer reach anything
    backend.emit('gopls', { method: '$/progress', params: { token: 'x', value: { kind: 'begin', title: 't' } } });
    expect(session.servers.value).toEqual({});

    await session.ensure('go');
    await flush();
    expect(backend.state.started).toBe(2);
    expect(session.syncClientFor('go')).not.toBe(oldClient);
    expect(session.syncClientFor('go')).not.toBeNull();
  });

  it('ignores a start that was superseded by a project switch', async () => {
    const backend = fakeBackend();
    const session = createLspSession({ api: backend.api, createClient: (o) => createLspClient(o), graceMs: 10 });
    session.reset('/a');
    const p = session.ensure('go');
    session.reset('/b');
    await p;
    await flush();
    expect(session.servers.value).toEqual({});
  });
});
