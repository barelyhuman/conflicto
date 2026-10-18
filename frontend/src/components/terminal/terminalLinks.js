/**
 * Pure link detection for terminal output: http(s) URLs and file paths with
 * optional line/column (`a.go:42`, `a.go:42:5`, `a.ts(42,5)`, `a.py line 42`).
 * No DOM / xterm dependencies — see terminalLinkProvider.js for the glue.
 */

/**
 * @typedef {{
 *   kind: 'url' | 'file',
 *   start: number,
 *   end: number,
 *   text: string,
 *   url?: string,
 *   path?: string,
 *   line?: number | null,
 *   col?: number | null,
 * }} TerminalLink
 * `start` inclusive, `end` exclusive (offsets into the scanned text).
 */

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

const SEG = '[\\w@.+\\-]+';
// Either "<dirs>/name.ext" (relative or absolute), a bare "name.ext", or an
// explicitly anchored path ("./x", "../x", "/x") of any shape.
const PATH_BODY =
  `(?:(?:\\.{1,2}\\/|\\/)?(?:${SEG}\\/)*${SEG}\\.[A-Za-z][A-Za-z0-9]*` +
  `|(?:\\.{1,2}\\/|\\/)(?:${SEG}\\/)*${SEG})`;
const LOCATION = '(?::(\\d+)(?::(\\d+))?|\\((\\d+)(?:,\\s*(\\d+))?\\)|\\s+line\\s+(\\d+))?';
const PATH_RE = new RegExp(`(${PATH_BODY})${LOCATION}`, 'g');

/** Characters that mean the match started mid-token (so it is not a path). */
const TOKEN_CHAR = /[\w/.\-@~:+%]/;

/** Strip trailing sentence punctuation from a URL; keep balanced parens. */
function trimUrl(url) {
  let out = url;

  for (;;) {
    const last = out[out.length - 1];

    if (!last) break;

    if (/[.,;:!?'"\]}>*]/.test(last)) {
      out = out.slice(0, -1);
      continue;
    }

    if (last === ')') {
      const opens = (out.match(/\(/g) ?? []).length;
      const closes = (out.match(/\)/g) ?? []).length;

      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return out;
}

function toInt(v) {
  if (v == null) return null;
  const n = Number(v);

  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Find URL and file-path links in a line of text.
 * @param {string} text
 * @returns {TerminalLink[]} sorted by start, non-overlapping
 */
export function findLinks(text) {
  /** @type {TerminalLink[]} */
  const links = [];

  if (!text) return links;

  URL_RE.lastIndex = 0;
  let m;

  while ((m = URL_RE.exec(text)) != null) {
    const url = trimUrl(m[0]);

    if (url.length <= 'http://'.length) continue;
    links.push({ kind: 'url', start: m.index, end: m.index + url.length, text: url, url });
  }

  PATH_RE.lastIndex = 0;

  while ((m = PATH_RE.exec(text)) != null) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > 0 && TOKEN_CHAR.test(text[start - 1])) continue;

    if (links.some((l) => start < l.end && end > l.start)) continue;

    const line = toInt(m[2] ?? m[4] ?? m[6]);
    const col = line == null ? null : toInt(m[3] ?? m[5]);
    // Without a location, drop a trailing "." that PATH_BODY cannot hold anyway.
    links.push({ kind: 'file', start, end, text: m[0], path: m[1], line, col });
  }

  return links.sort((a, b) => a.start - b.start);
}

/** Collapse `.` / `..` / duplicate slashes in an absolute posix path. Returns null if it escapes `/`. */
export function normalizeAbsolute(p) {
  const out = [];

  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;

    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }

  return '/' + out.join('/');
}

/**
 * Map a path found in terminal output to repo-relative candidates inside
 * `root`. Relative paths are tried against `cwd` first, then `root`.
 * Anything resolving outside `root` is dropped.
 * @param {string} path
 * @param {{ root: string | null | undefined, cwd?: string | null }} ctx
 * @returns {string[]} repo-relative paths (deduped, most likely first)
 */
export function resolveRepoRelative(path, { root, cwd }) {
  if (!path || !root || !root.startsWith('/')) return [];

  const rootAbs = normalizeAbsolute(root);

  if (!rootAbs) return [];

  /** @type {string[]} */
  const absCandidates = [];

  if (path.startsWith('/')) {
    absCandidates.push(path);
  } else {
    if (cwd && cwd.startsWith('/')) absCandidates.push(`${cwd}/${path}`);
    absCandidates.push(`${rootAbs}/${path}`);
  }

  const result = [];

  for (const c of absCandidates) {
    const abs = normalizeAbsolute(c);

    if (!abs) continue;

    const prefix = rootAbs === '/' ? '/' : rootAbs + '/';

    if (!abs.startsWith(prefix) || abs.length === prefix.length) continue;

    const rel = abs.slice(prefix.length);

    if (!result.includes(rel)) result.push(rel);
  }

  return result;
}

/** Cmd+click on macOS, Ctrl+click elsewhere. */
export function isOpenModifier(event, isMac) {
  return isMac ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
}
