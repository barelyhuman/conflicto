import { describe, expect, it } from 'vitest';
import { languageKeyForPath, usesTabs } from './languages.js';

describe('languageKeyForPath', () => {
  it('maps extensions', () => {
    expect(languageKeyForPath('src/app.jsx')).toBe('jsx');
    expect(languageKeyForPath('a/b/c.test.ts')).toBe('typescript');
    expect(languageKeyForPath('x.tsx')).toBe('tsx');
    expect(languageKeyForPath('main.go')).toBe('go');
    expect(languageKeyForPath('lib.RS')).toBe('rust');
    expect(languageKeyForPath('ci.yml')).toBe('yaml');
    expect(languageKeyForPath('README.md')).toBe('markdown');
  });

  it('maps special file names and ignores directories with dots', () => {
    expect(languageKeyForPath('go.mod')).toBe('go');
    expect(languageKeyForPath('dir.d/Makefile')).toBeNull();
  });

  it('returns null for unknown or extensionless files', () => {
    expect(languageKeyForPath('LICENSE')).toBeNull();
    expect(languageKeyForPath('a.xyz')).toBeNull();
  });

  it('uses tabs for Go', () => {
    expect(usesTabs('go')).toBe(true);
    expect(usesTabs('python')).toBe(false);
  });
});
