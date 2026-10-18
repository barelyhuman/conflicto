import { describe, expect, it, vi } from 'vitest';
import { createExistenceCache, readLogicalLine, registerTerminalLinks } from './terminalLinkProvider.js';

function fakeTerm(rows, cols = 40) {
  // rows: array of { text, wrapped }
  let provider;

  return {
    cols,
    buffer: {
      active: {
        getLine: (i) =>
          rows[i]
            ? {
                isWrapped: Boolean(rows[i].wrapped),
                translateToString: (trim) => (trim ? rows[i].text.trimEnd() : rows[i].text.padEnd(cols)),
              }
            : undefined,
      },
    },
    registerLinkProvider: (p) => {
      provider = p;

      return { dispose() {} };
    },
    provide: (y) => new Promise((res) => provider.provideLinks(y, res)),
  };
}

describe('createExistenceCache', () => {
  it('batches, caches and expires misses sooner than hits', async () => {
    let t = 0;
    const check = vi.fn(async (paths) => Object.fromEntries(paths.map((p) => [p, p === 'a.go'])));
    const c = createExistenceCache({ check, now: () => t, okTtlMs: 1000, missTtlMs: 100 });

    expect([...(await c.existing('/r', ['a.go', 'b.go']))]).toEqual(['a.go']);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toEqual(['a.go', 'b.go']);

    await c.existing('/r', ['a.go', 'b.go']);
    expect(check).toHaveBeenCalledTimes(1);

    t = 200; // miss expired, hit not
    await c.existing('/r', ['a.go', 'b.go']);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls[1][0]).toEqual(['b.go']);
  });

  it('dedupes concurrent lookups and namespaces by root', async () => {
    const check = vi.fn(async (paths) => Object.fromEntries(paths.map((p) => [p, true])));
    const c = createExistenceCache({ check });

    await Promise.all([c.existing('/r', ['a.go']), c.existing('/r', ['a.go'])]);
    expect(check).toHaveBeenCalledTimes(1);
    await c.existing('/other', ['a.go']);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('treats backend failure as missing', async () => {
    const c = createExistenceCache({ check: async () => { throw new Error('x'); } });
    expect((await c.existing('/r', ['a.go'])).size).toBe(0);
  });
});

describe('readLogicalLine', () => {
  it('joins wrapped rows', () => {
    const term = fakeTerm([{ text: 'src/very/lo' }, { text: 'ng.go:3', wrapped: true }], 11);
    const r = readLogicalLine(term, 1);
    expect(r.startRow).toBe(0);
    expect(r.text).toBe('src/very/long.go:3');
  });
});

describe('registerTerminalLinks', () => {
  const mk = (rows, existing, extra = {}) => {
    const term = fakeTerm(rows);
    const openFile = vi.fn();
    const openUrl = vi.fn();
    const exists = createExistenceCache({
      check: async (paths) => Object.fromEntries(paths.map((p) => [p, existing.includes(p)])),
    });
    registerTerminalLinks(term, {
      getRoot: () => '/wt',
      getCwd: () => '/wt',
      exists,
      openFile,
      openUrl,
      isMac: true,
      ...extra,
    });

    return { term, openFile, openUrl };
  };

  it('linkifies only existing files, with 1-based ranges', async () => {
    const { term } = mk([{ text: 'x src/a.go:42 and nope/b.go:1' }], ['src/a.go']);
    const links = await term.provide(1);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe('src/a.go:42');
    expect(links[0].range).toEqual({ start: { x: 3, y: 1 }, end: { x: 13, y: 1 } });
  });

  it('opens on Cmd+click only', async () => {
    const { term, openFile } = mk([{ text: 'src/a.go:42:7' }], ['src/a.go']);
    const [link] = await term.provide(1);
    link.activate({ metaKey: false, ctrlKey: true });
    expect(openFile).not.toHaveBeenCalled();
    link.activate({ metaKey: true, preventDefault() {} });
    expect(openFile).toHaveBeenCalledWith('src/a.go', 42, 7);
  });

  it('opens urls without an existence check', async () => {
    const { term, openUrl } = mk([{ text: 'go to https://example.com/x.' }], []);
    const [link] = await term.provide(1);
    link.activate({ metaKey: true });
    expect(openUrl).toHaveBeenCalledWith('https://example.com/x');
  });

  it('returns nothing for plain lines and files outside the worktree', async () => {
    const { term } = mk([{ text: 'hello world' }, { text: '/etc/hosts.conf:1' }], ['etc/hosts.conf']);
    expect(await term.provide(1)).toBeUndefined();
    expect(await term.provide(2)).toBeUndefined();
  });

  it('links across wrapped rows from either row', async () => {
    const term = fakeTerm([{ text: 'src/very/lo' }, { text: 'ng.go:3', wrapped: true }], 11);
    const openFile = vi.fn();
    registerTerminalLinks(term, {
      getRoot: () => '/wt',
      getCwd: () => '/wt',
      exists: createExistenceCache({ check: async (p) => Object.fromEntries(p.map((x) => [x, true])) }),
      openFile,
      openUrl: vi.fn(),
    });
    const l1 = await term.provide(1);
    const l2 = await term.provide(2);
    expect(l1[0].range.start).toEqual({ x: 1, y: 1 });
    expect(l1[0].range.end).toEqual({ x: 7, y: 2 });
    expect(l2).toHaveLength(1);
  });
});
