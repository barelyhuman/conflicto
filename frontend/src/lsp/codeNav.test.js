import { describe, expect, it, vi } from 'vitest';
import { createCodeNav } from './codeNav.js';
import { createNavHistory } from './navHistory.js';

const ROOT = 'file:///work/repo';
const range = (line, character) => ({
  start: { line, character },
  end: { line, character: character + 1 },
});

function setup({ client = null, matches = [], current = { path: 'cur.go', line: 3, col: 1 } } = {}) {
  const openFileAt = vi.fn();
  const showResults = vi.fn();
  const notify = vi.fn();
  const searchText = vi.fn(async () => matches);
  const history = createNavHistory();
  const nav = createCodeNav({
    session: { readyClientFor: () => client },
    searchText,
    openFileAt,
    history,
    getCurrent: () => current,
    showResults,
    readLines: async () => ['line one', 'line two'],
    notify,
  });

  return { nav, openFileAt, showResults, notify, searchText, history };
}

const req = { path: 'a.go', languageId: 'go', position: { line: 0, character: 0 }, word: 'Foo' };

describe('gotoDefinition with a ready server', () => {
  it('jumps to a single in-workspace definition and records history', async () => {
    const client = {
      rootUri: ROOT,
      definition: vi.fn(async () => [{ uri: `${ROOT}/pkg/b.go`, range: range(9, 4) }]),
    };
    const { nav, openFileAt, history } = setup({ client });
    expect(await nav.gotoDefinition(req)).toBe('lsp');
    expect(client.definition).toHaveBeenCalledWith(`${ROOT}/a.go`, req.position);
    expect(openFileAt).toHaveBeenCalledWith('pkg/b.go', 10, 5);
    expect(history.canBack).toBe(true);
  });

  it('shows a results panel for multiple definitions with previews', async () => {
    const client = {
      rootUri: ROOT,
      definition: vi.fn(async () => [
        { uri: `${ROOT}/x.go`, range: range(0, 0) },
        { uri: `${ROOT}/y.go`, range: range(1, 2) },
      ]),
    };
    const { nav, showResults, openFileAt } = setup({ client });
    expect(await nav.gotoDefinition(req)).toBe('lsp-multiple');
    expect(openFileAt).not.toHaveBeenCalled();
    const { items, title } = showResults.mock.calls[0][0];
    expect(title).toBe('Definitions of Foo');
    expect(items[1]).toMatchObject({ path: 'y.go', line: 2, col: 3, text: 'line two', len: 3 });
  });

  it('falls back to text search when the request fails', async () => {
    const client = { rootUri: ROOT, definition: vi.fn(async () => Promise.reject(new Error('x'))) };
    const { nav, openFileAt } = setup({
      client,
      matches: [{ path: 'z.go', line: 4, col: 6, text: 'func Foo() {' }],
    });
    expect(await nav.gotoDefinition(req)).toBe('text');
    expect(openFileAt).toHaveBeenCalledWith('z.go', 4, 6);
  });

  it('tells the user when the definition is outside the workspace', async () => {
    const client = {
      rootUri: ROOT,
      definition: vi.fn(async () => [{ uri: 'file:///usr/go/fmt.go', range: range(0, 0) }]),
    };
    const { nav, notify } = setup({ client });
    await nav.gotoDefinition(req);
    expect(notify).toHaveBeenCalledWith('Definition is outside the workspace');
  });
});

describe('gotoDefinition fallback (server not ready)', () => {
  it('searches whole-word in the language glob and jumps to a single strong match', async () => {
    const { nav, openFileAt, searchText } = setup({
      matches: [
        { path: 'a.go', line: 9, col: 3, text: '\treturn Foo()' },
        { path: 'b.go', line: 2, col: 6, text: 'func Foo() int {' },
      ],
    });
    expect(await nav.gotoDefinition(req)).toBe('text');
    expect(searchText).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Foo', wholeWord: true, caseSensitive: true, glob: '*.go' })
    );
    expect(openFileAt).toHaveBeenCalledWith('b.go', 2, 6);
  });

  it('shows candidates (strong first) when ambiguous', async () => {
    const { nav, showResults, openFileAt } = setup({
      matches: [
        { path: 'a.go', line: 9, col: 3, text: '\treturn Foo()' },
        { path: 'b.go', line: 2, col: 6, text: 'func Foo() int {' },
        { path: 'c.go', line: 7, col: 6, text: 'type Foo struct{}' },
      ],
    });
    expect(await nav.gotoDefinition(req)).toBe('text-multiple');
    expect(openFileAt).not.toHaveBeenCalled();
    expect(showResults.mock.calls[0][0].items.map((i) => i.path)).toEqual(['b.go', 'c.go', 'a.go']);
  });

  it('shows weak matches when nothing looks like a definition, and notifies on none', async () => {
    const weak = setup({ matches: [{ path: 'a.go', line: 1, col: 1, text: 'Foo()' }] });
    expect(await weak.nav.gotoDefinition(req)).toBe('text-multiple');
    expect(weak.showResults.mock.calls[0][0].title).toMatch(/Text matches/);

    const none = setup({ matches: [] });
    expect(await none.nav.gotoDefinition(req)).toBe('none');
    expect(none.notify).toHaveBeenCalledWith('No definition found for Foo');
  });
});

describe('findReferences and history', () => {
  it('lists references from the server', async () => {
    const client = {
      rootUri: ROOT,
      references: vi.fn(async () => [
        { uri: `${ROOT}/a.go`, range: range(0, 0) },
        { uri: `${ROOT}/b.go`, range: range(1, 0) },
      ]),
    };
    const { nav, showResults } = setup({ client });
    expect(await nav.findReferences(req)).toBe('lsp');
    expect(showResults.mock.calls[0][0].title).toBe('References to Foo');
    expect(showResults.mock.calls[0][0].items).toHaveLength(2);
  });

  it('falls back to text matches without a server', async () => {
    const { nav, showResults } = setup({ matches: [{ path: 'a.go', line: 1, col: 1, text: 'Foo' }] });
    expect(await nav.findReferences(req)).toBe('text');
    expect(showResults.mock.calls[0][0].items[0]).toMatchObject({ path: 'a.go', len: 3 });
  });

  it('back/forward replay the jump stack', async () => {
    const client = {
      rootUri: ROOT,
      definition: vi.fn(async () => [{ uri: `${ROOT}/b.go`, range: range(4, 0) }]),
    };
    const { nav, openFileAt } = setup({ client, current: { path: 'cur.go', line: 3, col: 1 } });
    await nav.gotoDefinition(req);
    nav.back();
    expect(openFileAt).toHaveBeenLastCalledWith('cur.go', 3, 1);
    nav.forward();
    expect(openFileAt).toHaveBeenLastCalledWith('cur.go', 3, 1); // forward pushes `current` (stubbed constant)
  });
});
