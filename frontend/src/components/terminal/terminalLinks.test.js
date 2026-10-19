import { describe, expect, it } from 'vitest';
import {
  findTerminalLinksInLine,
  joinPaths,
  parsePathLineColumn,
  repoRelativeFromAbsolute,
  resolveTerminalFilePath,
} from './terminalLinks.js';

describe('parsePathLineColumn', () => {
  it('parses line and column suffixes', () => {
    expect(parsePathLineColumn('src/app.go:12:3')).toEqual({
      path: 'src/app.go',
      line: 12,
      column: 3,
    });
    expect(parsePathLineColumn('./foo/bar.js:99')).toEqual({
      path: './foo/bar.js',
      line: 99,
      column: null,
    });
  });

  it('parses file URLs', () => {
    expect(parsePathLineColumn('file:///repo/src/main.go#L10')).toEqual({
      path: '/repo/src/main.go',
      line: 10,
      column: null,
    });
  });
});

describe('findTerminalLinksInLine', () => {
  it('finds http and file paths without overlap', () => {
    const line = 'see https://example.com/docs and ./src/a.go:4:1 for details';
    const links = findTerminalLinksInLine(line);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ kind: 'http', url: 'https://example.com/docs' });
    expect(links[1]).toMatchObject({ kind: 'file', raw: './src/a.go:4:1', line: 4, column: 1 });
  });
});

describe('resolveTerminalFilePath', () => {
  const repoRoot = '/repo/project';

  it('resolves relative paths from cwd', () => {
    expect(
      resolveTerminalFilePath('./pkg/x.go', { repoRoot, cwd: '/repo/project/cmd' })
    ).toBe('cmd/pkg/x.go');
  });

  it('resolves absolute paths inside the repo', () => {
    expect(
      resolveTerminalFilePath('/repo/project/internal/a.go', { repoRoot, cwd: null })
    ).toBe('internal/a.go');
  });

  it('rejects paths outside the repo', () => {
    expect(
      resolveTerminalFilePath('/etc/passwd', { repoRoot, cwd: null })
    ).toBeNull();
  });
});

describe('path helpers', () => {
  it('joins and relativizes', () => {
    expect(joinPaths('/a/b', 'c/d')).toBe('/a/b/c/d');
    expect(repoRelativeFromAbsolute('/a/b/c.txt', '/a/b')).toBe('c.txt');
  });
});
