import { describe, expect, it } from 'vitest';
import { locationsToTargets, pathToUri, uriToPath } from './uri.js';
import { languageGlob, lspLanguageId } from './languageId.js';

const root = 'file:///work/my%20repo';

describe('uri mapping', () => {
  it('maps paths to URIs and back', () => {
    const uri = pathToUri(`${root}/`, 'cmd/a b/main.go');
    expect(uri).toBe('file:///work/my%20repo/cmd/a%20b/main.go');
    expect(uriToPath(root, uri)).toBe('cmd/a b/main.go');
  });

  it('returns null for URIs outside the workspace', () => {
    expect(uriToPath(root, 'file:///usr/local/go/src/fmt/print.go')).toBeNull();
    expect(uriToPath(root, 'file:///work/my%20repo-other/x.go')).toBeNull();
  });

  it('normalises Location and LocationLink results (1-based)', () => {
    const loc = {
      uri: `${root}/a.go`,
      range: { start: { line: 4, character: 2 }, end: { line: 4, character: 5 } },
    };
    const link = {
      targetUri: `${root}/b.go`,
      targetRange: { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } },
      targetSelectionRange: { start: { line: 2, character: 5 }, end: { line: 2, character: 8 } },
    };
    const ext = { uri: 'file:///elsewhere/c.go', range: loc.range };
    expect(locationsToTargets(root, [loc, link, ext])).toEqual([
      { uri: loc.uri, path: 'a.go', line: 5, col: 3 },
      { uri: link.targetUri, path: 'b.go', line: 3, col: 6 },
      { uri: ext.uri, path: null, line: 5, col: 3 },
    ]);
    expect(locationsToTargets(root, loc)).toHaveLength(1);
    expect(locationsToTargets(root, null)).toEqual([]);
  });
});

describe('languageId', () => {
  it('maps extensions to LSP language ids', () => {
    expect(lspLanguageId('a/b.go')).toBe('go');
    expect(lspLanguageId('go.mod')).toBe('gomod');
    expect(lspLanguageId('x.tsx')).toBe('typescriptreact');
    expect(lspLanguageId('x.mjs')).toBe('javascript');
    expect(lspLanguageId('README.md')).toBeNull();
    expect(languageGlob('go')).toBe('*.go');
  });
});
