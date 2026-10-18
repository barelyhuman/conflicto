const EXT = {
  go: 'go',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascriptreact',
  py: 'python',
  rs: 'rust',
};

/**
 * LSP languageId for a repo path, or null when we have no server for it.
 * @param {string} path
 */
export function lspLanguageId(path) {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

  if (base === 'go.mod') return 'gomod';
  const dot = base.lastIndexOf('.');

  return dot < 0 ? null : (EXT[base.slice(dot + 1)] ?? null);
}

/** Glob that limits a text-search to files of the same language family. */
export function languageGlob(languageId) {
  switch (languageId) {
    case 'go':
      return '*.go';
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
    case 'python':
      return '*.py';
    case 'rust':
      return '*.rs';
    default:
      return '';
  }
}
