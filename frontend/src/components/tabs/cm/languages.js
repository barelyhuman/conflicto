/**
 * Lazy language support for file tabs. Each language package is its own
 * dynamic import so only the languages actually opened are downloaded.
 */

/** @type {Record<string, string>} extension (lowercase, no dot) -> language key */
const EXT_TO_LANG = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  go: 'go',
  css: 'css',
  html: 'html',
  htm: 'html',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  yml: 'yaml',
  yaml: 'yaml',
};

const NAME_TO_LANG = {
  'go.mod': 'go',
  'go.sum': 'go',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
};

/**
 * @param {string} path
 * @returns {string | null} language key, or null when unsupported
 */
export function languageKeyForPath(path) {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

  if (NAME_TO_LANG[base]) return NAME_TO_LANG[base];
  const dot = base.lastIndexOf('.');

  if (dot < 0) return null;

  return EXT_TO_LANG[base.slice(dot + 1)] ?? null;
}

/** Whether the language conventionally indents with hard tabs. */
export function usesTabs(key) {
  return key === 'go';
}

const LOADERS = {
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  jsx: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  typescript: () =>
    import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  tsx: () =>
    import('@codemirror/lang-javascript').then((m) =>
      m.javascript({ typescript: true, jsx: true })
    ),
  go: () => import('@codemirror/lang-go').then((m) => m.go()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  markdown: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  rust: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  yaml: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
};

/**
 * Load the CodeMirror language extension for a file path.
 * @param {string} path
 * @returns {Promise<import('@codemirror/state').Extension | null>}
 */
export async function loadLanguage(path) {
  const key = languageKeyForPath(path);

  if (!key) return null;

  try {
    return await LOADERS[key]();
  } catch {
    return null;
  }
}
