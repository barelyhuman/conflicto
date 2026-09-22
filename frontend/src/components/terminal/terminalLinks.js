/**
 * Detect and resolve file / HTTP links in terminal buffer lines for Cmd/Ctrl+click.
 */

/** @typedef {{ kind: 'http', url: string, start: number, end: number }} HttpTerminalLink */
/** @typedef {{ kind: 'file', raw: string, path: string, line: number, column: number|null, start: number, end: number }} FileTerminalLink */
/** @typedef {HttpTerminalLink | FileTerminalLink} TerminalLineLink */

const HTTP_RE = /https?:\/\/[^\s<>"'\]]+/g;
const FILE_URL_RE = /file:\/\/[^\s<>"'\]]+/g;
const FILE_PATH_RE =
  /(?:\.\.?\/|\/)(?:[^\s\]:]+)(?::\d+(?::\d+)?)?|\b[A-Za-z0-9._-]+\/[A-Za-z0-9._./-]+(?::\d+(?::\d+)?)?/g;

/**
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function isTerminalLinkClick(event) {
  return Boolean(event.metaKey || event.ctrlKey);
}

/**
 * Strip trailing punctuation often wrapped around paths in compiler output.
 * @param {string} token
 */
function trimLinkToken(token) {
  return token.replace(/[)\],.;>]+$/g, '');
}

/**
 * Split a path token into path + optional 1-based line/column (compiler `path:line:col`).
 * @param {string} token
 * @returns {{ path: string, line: number, column: number|null }}
 */
export function parsePathLineColumn(token) {
  const cleaned = trimLinkToken(token);
  if (cleaned.startsWith('file://')) {
    try {
      const url = new URL(cleaned);
      let path = decodeURIComponent(url.pathname || '');
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      const hashLine = url.hash.match(/^#L(\d+)(?:C(\d+))?$/i);
      const line = hashLine ? Number(hashLine[1]) : 1;
      const column = hashLine?.[2] ? Number(hashLine[2]) : null;
      return { path, line: Number.isFinite(line) ? line : 1, column };
    } catch {
      return { path: cleaned, line: 1, column: null };
    }
  }

  const parts = cleaned.split(':');
  if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1]) && /^\d+$/.test(parts[parts.length - 2])) {
    const column = Number(parts.pop());
    const line = Number(parts.pop());
    return {
      path: parts.join(':'),
      line: Number.isFinite(line) ? line : 1,
      column: Number.isFinite(column) ? column : null,
    };
  }
  if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
    const line = Number(parts.pop());
    return {
      path: parts.join(':'),
      line: Number.isFinite(line) ? line : 1,
      column: null,
    };
  }
  return { path: cleaned, line: 1, column: null };
}

/**
 * @param {string} lineText
 * @returns {TerminalLineLink[]}
 */
export function findTerminalLinksInLine(lineText) {
  /** @type {TerminalLineLink[]} */
  const links = [];
  /** @type {[number, number][]} */
  const occupied = [];

  function overlaps(start, end) {
    return occupied.some(([s, e]) => start < e && end > s);
  }

  function mark(start, end) {
    occupied.push([start, end]);
  }

  for (const re of [HTTP_RE, FILE_URL_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(lineText)) != null) {
      const start = match.index;
      const end = start + match[0].length;
      if (overlaps(start, end)) continue;
      mark(start, end);
      if (re === HTTP_RE) {
        links.push({ kind: 'http', url: match[0], start, end });
      } else {
        const parsed = parsePathLineColumn(match[0]);
        links.push({
          kind: 'file',
          raw: match[0],
          path: parsed.path,
          line: parsed.line,
          column: parsed.column,
          start,
          end,
        });
      }
    }
  }

  FILE_PATH_RE.lastIndex = 0;
  let fileMatch;
  while ((fileMatch = FILE_PATH_RE.exec(lineText)) != null) {
    const start = fileMatch.index;
    const end = start + fileMatch[0].length;
    if (overlaps(start, end)) continue;
    const parsed = parsePathLineColumn(fileMatch[0]);
    if (!parsed.path || parsed.path === '.' || parsed.path === '..') continue;
    mark(start, end);
    links.push({
      kind: 'file',
      raw: fileMatch[0],
      path: parsed.path,
      line: parsed.line,
      column: parsed.column,
      start,
      end,
    });
  }

  links.sort((a, b) => a.start - b.start);
  return links;
}

/**
 * Normalize to forward slashes without a trailing slash (except root `/`).
 * @param {string} p
 */
export function normalizePath(p) {
  if (!p) return '';
  let out = p.replace(/\\/g, '/');
  while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/**
 * Join base directory and a relative path segment.
 * @param {string} baseDir
 * @param {string} rel
 */
export function joinPaths(baseDir, rel) {
  const base = normalizePath(baseDir);
  const r = normalizePath(rel);
  if (!base) return collapseDotSegments(r);
  if (r.startsWith('/')) return collapseDotSegments(r);
  const joined = base.endsWith('/') ? `${base}${r}` : `${base}/${r}`;
  return collapseDotSegments(joined);
}

/**
 * Collapse `.` / `..` path segments after joining.
 * @param {string} path
 */
function collapseDotSegments(path) {
  const absolute = path.startsWith('/');
  const parts = path.split('/').filter((p) => p.length > 0);
  /** @type {string[]} */
  const out = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join('/');
  return absolute ? `/${joined}` : joined;
}

/**
 * Resolve an absolute filesystem path to a repo-relative path, or null if outside the repo.
 * @param {string} absolutePath
 * @param {string} repoRoot
 * @returns {string|null}
 */
export function repoRelativeFromAbsolute(absolutePath, repoRoot) {
  const root = normalizePath(repoRoot);
  const abs = normalizePath(absolutePath);
  if (!root || !abs) return null;
  if (abs === root) return '';
  const prefix = `${root}/`;
  if (!abs.startsWith(prefix)) return null;
  return abs.slice(prefix.length);
}

/**
 * Resolve a terminal file link to a repo-relative path.
 * @param {string} rawPath from parsePathLineColumn().path
 * @param {{ repoRoot: string|null|undefined, cwd: string|null|undefined }} ctx
 * @returns {string|null}
 */
export function resolveTerminalFilePath(rawPath, ctx) {
  const repoRoot = ctx.repoRoot ? normalizePath(ctx.repoRoot) : '';
  if (!repoRoot) return null;

  let path = normalizePath(rawPath);
  if (path.startsWith('file://')) {
    const parsed = parsePathLineColumn(path);
    path = normalizePath(parsed.path);
  }

  let absolute;
  if (path.startsWith('/')) {
    absolute = path;
  } else {
    const base = ctx.cwd ? normalizePath(ctx.cwd) : repoRoot;
    absolute = joinPaths(base, path);
  }

  return repoRelativeFromAbsolute(absolute, repoRoot);
}

/**
 * Build xterm link ranges for a buffer line.
 * @param {string} lineText
 * @param {number} bufferLineNumber 1-based y
 * @param {{ repoRoot: string|null|undefined, cwd: string|null|undefined, onOpen: (payload: TerminalOpenPayload) => void }} ctx
 * @returns {import('@xterm/xterm').ILink[]}
 */
export function terminalLinksForLine(lineText, bufferLineNumber, ctx) {
  const found = findTerminalLinksInLine(lineText);
  if (!found.length) return [];

  return found.map((link) => {
    const startX = link.start + 1;
    const endX = link.end;
    return {
      text: link.kind === 'http' ? link.url : link.raw,
      range: {
        start: { x: startX, y: bufferLineNumber },
        end: { x: endX, y: bufferLineNumber },
      },
      activate: (event) => {
        if (!isTerminalLinkClick(event)) return;
        if (link.kind === 'http') {
          ctx.onOpen({ kind: 'http', url: link.url });
          return;
        }
        const repoPath = resolveTerminalFilePath(link.path, ctx);
        if (!repoPath) return;
        ctx.onOpen({
          kind: 'file',
          path: repoPath,
          line: link.line,
          column: link.column,
        });
      },
    };
  });
}

/** @typedef {{ kind: 'http', url: string } | { kind: 'file', path: string, line: number, column: number|null }} TerminalOpenPayload */

/**
 * @param {import('@xterm/xterm').Terminal} term
 * @param {{ repoRoot: string|null|undefined, getCwd: () => string|null|undefined, onOpen: (payload: TerminalOpenPayload) => void }} options
 */
export function attachTerminalLinkHandling(term, options) {
  const linkHandler = {
    allowNonHttpProtocols: true,
    activate: (event, text) => {
      if (!isTerminalLinkClick(event)) return;
      if (/^https?:\/\//i.test(text)) {
        options.onOpen({ kind: 'http', url: text });
        return;
      }
      if (/^file:\/\//i.test(text)) {
        const repoPath = resolveTerminalFilePath(text, {
          repoRoot: options.repoRoot,
          cwd: options.getCwd(),
        });
        if (!repoPath) return;
        const { line } = parsePathLineColumn(text);
        options.onOpen({ kind: 'file', path: repoPath, line, column: null });
      }
    },
  };

  term.options.linkHandler = linkHandler;

  const provider = {
    provideLinks(bufferLineNumber, callback) {
      const line = term.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }
      const lineText = line.translateToString(true);
      const links = terminalLinksForLine(lineText, bufferLineNumber, {
        repoRoot: options.repoRoot,
        cwd: options.getCwd(),
        onOpen: options.onOpen,
      });
      callback(links.length ? links : undefined);
    },
  };

  const disposable = term.registerLinkProvider(provider);

  return () => {
    disposable.dispose();
    term.options.linkHandler = null;
  };
}
