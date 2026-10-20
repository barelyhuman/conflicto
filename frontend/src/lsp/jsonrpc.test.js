import { describe, expect, it } from 'vitest';
import { createRpc, RpcError, REQUEST_CANCELLED } from './jsonrpc.js';

function setup() {
  const sent = [];
  const rpc = createRpc({ send: (raw) => sent.push(JSON.parse(raw)) });

  return { rpc, sent };
}

describe('jsonrpc', () => {
  it('matches responses to requests by id, out of order', async () => {
    const { rpc, sent } = setup();
    const a = rpc.request('a');
    const b = rpc.request('b', { x: 1 });
    expect(sent.map((m) => m.method)).toEqual(['a', 'b']);
    expect(sent[0].jsonrpc).toBe('2.0');
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[1].id, result: 'B' }));
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0].id, result: 'A' }));
    await expect(a).resolves.toBe('A');
    await expect(b).resolves.toBe('B');
    expect(rpc.pendingCount).toBe(0);
  });

  it('rejects with RpcError on error responses', async () => {
    const { rpc, sent } = setup();
    const p = rpc.request('x');
    rpc.receive(JSON.stringify({ id: sent[0].id, error: { code: -32601, message: 'nope' } }));
    await expect(p).rejects.toMatchObject({ name: 'RpcError', code: -32601, message: 'nope' });
  });

  it('sends $/cancelRequest and rejects on abort', async () => {
    const { rpc, sent } = setup();
    const ac = new AbortController();
    const p = rpc.request('slow', null, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: REQUEST_CANCELLED });
    expect(sent[1]).toMatchObject({ method: '$/cancelRequest', params: { id: sent[0].id } });
  });

  it('dispatches notifications and answers server requests', async () => {
    const { rpc, sent } = setup();
    const seen = [];
    rpc.onNotification('foo', (p) => seen.push(p));
    rpc.onRequest('ask', (p) => ({ echo: p }));
    rpc.receive(JSON.stringify({ method: 'foo', params: 1 }));
    rpc.receive(JSON.stringify({ id: 7, method: 'ask', params: 'hi' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([1]);
    expect(sent).toContainEqual({ jsonrpc: '2.0', id: 7, result: { echo: 'hi' } });
  });

  it('answers unknown server requests with MethodNotFound and handler errors', async () => {
    const { rpc, sent } = setup();
    rpc.onRequest('boom', () => {
      throw new RpcError(-5, 'bad');
    });
    rpc.receive(JSON.stringify({ id: 1, method: 'unknown' }));
    rpc.receive(JSON.stringify({ id: 2, method: 'boom' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.find((m) => m.id === 1).error.code).toBe(-32601);
    expect(sent.find((m) => m.id === 2).error).toMatchObject({ code: -5, message: 'bad' });
  });

  it('ignores malformed input and rejects pending on dispose', async () => {
    const { rpc } = setup();
    rpc.receive('not json');
    const p = rpc.request('x');
    rpc.dispose();
    await expect(p).rejects.toMatchObject({ code: REQUEST_CANCELLED });
  });
});
