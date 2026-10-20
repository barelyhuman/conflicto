import { describe, expect, it } from 'vitest';
import { findLinks, normalizeAbsolute, resolveRepoRelative, isOpenModifier } from './terminalLinks.js';

const files = (text) => findLinks(text).filter((l) => l.kind === 'file');

describe('findLinks: performance', () => {
  it('stays linear on a very long unbroken token', () => {
    for (const text of ['a'.repeat(50000), 'a/'.repeat(25000), `${'a.'.repeat(25000)}b`]) {
      const t0 = performance.now();
      findLinks(text);
      expect(performance.now() - t0).toBeLessThan(1000);
    }
  });
});

describe('findLinks: file paths', () => {
  it('parses path:line', () => {
    const [l] = files('error in src/app.go:42 here');
    expect(l).toMatchObject({ path: 'src/app.go', line: 42, col: null, text: 'src/app.go:42' });
    expect('error in src/app.go:42 here'.slice(l.start, l.end)).toBe('src/app.go:42');
  });

  it('parses path:line:col with ./ prefix', () => {
    const [l] = files('./frontend/src/app.jsx:120:5: warning');
    expect(l).toMatchObject({ path: './frontend/src/app.jsx', line: 120, col: 5 });
  });

  it('parses absolute paths', () => {
    const [l] = files('at /abs/path/x.go:7');
    expect(l).toMatchObject({ path: '/abs/path/x.go', line: 7 });
  });

  it('parses path(line,col) and path(line)', () => {
    expect(files('src/a.ts(12,3): error TS1')[0]).toMatchObject({ path: 'src/a.ts', line: 12, col: 3 });
    expect(files('src/a.ts(12)')[0]).toMatchObject({ line: 12, col: null });
    expect(files('src/a.ts(12, 3)')[0]).toMatchObject({ line: 12, col: 3 });
  });

  it('parses "path line N"', () => {
    expect(files('see lib/x.py line 88 for details')[0]).toMatchObject({ path: 'lib/x.py', line: 88 });
  });

  it('accepts bare filenames with extension and no location', () => {
    expect(files('open README.md now')[0]).toMatchObject({ path: 'README.md', line: null });
  });

  it('does not swallow trailing punctuation', () => {
    expect(files('see src/a.go.')[0].text).toBe('src/a.go');
    expect(files('(src/a.go:3)')[0]).toMatchObject({ path: 'src/a.go', line: 3 });
    expect(files('`src/a.go:3`,')[0].text).toBe('src/a.go:3');
    expect(files('src/a.go: undefined')[0].text).toBe('src/a.go');
  });

  it('finds several links on one line in order', () => {
    const ls = files('a/b.go:1 and c/d.go:2:3');
    expect(ls.map((l) => l.path)).toEqual(['a/b.go', 'c/d.go']);
    expect(ls[1].col).toBe(3);
  });

  it('supports dashes, dots, @ and + in segments', () => {
    expect(files('node_modules/@scope/pkg-x/dist/a.min.js:9')[0]).toMatchObject({
      path: 'node_modules/@scope/pkg-x/dist/a.min.js',
      line: 9,
    });
  });

  it('ignores non-paths', () => {
    expect(files('version v1.2 and 10/12/2025 took 3.5s')).toEqual([]);
    expect(files('and/or')).toEqual([]);
    expect(files('')).toEqual([]);
  });

  it('does not start mid-token (home paths, mid-word)', () => {
    expect(files('~/code/x.go:3')).toEqual([]);
    expect(files('foo:bar/baz.go')).toEqual([]);
  });

  it('treats line 0 as no line', () => {
    expect(files('a.go:0')[0]).toMatchObject({ path: 'a.go', line: null });
  });
});

describe('findLinks: URLs', () => {
  it('finds http(s) urls and trims trailing punctuation', () => {
    const t = 'visit https://example.com/a?b=1, or (http://x.io/y).';
    const urls = findLinks(t).filter((l) => l.kind === 'url');
    expect(urls.map((u) => u.url)).toEqual(['https://example.com/a?b=1', 'http://x.io/y']);
  });

  it('keeps balanced parens in urls', () => {
    const [u] = findLinks('https://en.wikipedia.org/wiki/Go_(language)');
    expect(u.url).toBe('https://en.wikipedia.org/wiki/Go_(language)');
  });

  it('does not also linkify the path inside a url', () => {
    const ls = findLinks('https://github.com/o/r/blob/main/src/a.go:3');
    expect(ls).toHaveLength(1);
    expect(ls[0].kind).toBe('url');
  });

  it('ignores a bare scheme', () => {
    expect(findLinks('http://')).toEqual([]);
  });
});

describe('normalizeAbsolute', () => {
  it('collapses dots and slashes', () => {
    expect(normalizeAbsolute('/a/./b//c/../d')).toBe('/a/b/d');
  });
  it('returns null when escaping root', () => {
    expect(normalizeAbsolute('/a/../..')).toBeNull();
  });
});

describe('resolveRepoRelative', () => {
  const root = '/repo/wt';

  it('resolves relative to cwd then root', () => {
    expect(resolveRepoRelative('x.go', { root, cwd: '/repo/wt/pkg' })).toEqual(['pkg/x.go', 'x.go']);
  });

  it('dedupes when cwd is the root', () => {
    expect(resolveRepoRelative('./src/a.go', { root, cwd: root })).toEqual(['src/a.go']);
  });

  it('uses root when cwd missing', () => {
    expect(resolveRepoRelative('src/a.go', { root })).toEqual(['src/a.go']);
  });

  it('handles .. within the worktree', () => {
    expect(resolveRepoRelative('../a.go', { root, cwd: '/repo/wt/pkg' })).toEqual(['a.go']);
  });

  it('maps absolute paths inside root', () => {
    expect(resolveRepoRelative('/repo/wt/src/a.go', { root, cwd: '/elsewhere' })).toEqual(['src/a.go']);
  });

  it('rejects paths outside the worktree', () => {
    expect(resolveRepoRelative('/repo/other/a.go', { root, cwd: root })).toEqual([]);
    expect(resolveRepoRelative('../../etc/passwd.txt', { root, cwd: root })).toEqual([]);
    // sibling dir sharing a prefix
    expect(resolveRepoRelative('/repo/wt2/a.go', { root, cwd: root })).toEqual([]);
  });

  it('rejects the root itself and missing root', () => {
    expect(resolveRepoRelative('/repo/wt', { root })).toEqual([]);
    expect(resolveRepoRelative('a.go', { root: null })).toEqual([]);
    expect(resolveRepoRelative('a.go', { root: '' })).toEqual([]);
  });

  it('falls back to root when cwd is outside the worktree', () => {
    expect(resolveRepoRelative('src/a.go', { root, cwd: '/tmp' })).toEqual(['src/a.go']);
  });
});

describe('isOpenModifier', () => {
  it('uses meta on mac and ctrl elsewhere', () => {
    expect(isOpenModifier({ metaKey: true }, true)).toBe(true);
    expect(isOpenModifier({ ctrlKey: true }, true)).toBe(false);
    expect(isOpenModifier({ ctrlKey: true }, false)).toBe(true);
    expect(isOpenModifier({ metaKey: true }, false)).toBe(false);
  });
});
