/**
 * xterm link provider: turns URLs and `file:line[:col]` in terminal output into
 * Cmd/Ctrl+click links. Parsing lives in terminalLinks.js; this file only maps
 * buffer rows to text offsets and validates file existence (batched + cached).
 */
import { findLinks, resolveRepoRelative, isOpenModifier } from './terminalLinks.js';

/**
 * Batched, cached "does this repo-relative file exist" lookups.
 * Positive results are cached for `okTtlMs`, negatives for `missTtlMs` (a file
 * an agent is about to create should become linkable soon).
 * @param {{
 *   check: (paths: string[]) => Promise<Record<string, boolean> | null | undefined>,
 *   okTtlMs?: number,
 *   missTtlMs?: number,
 *   now?: () => number,
 * }} opts
 */
export function createExistenceCache({ check, okTtlMs = 60_000, missTtlMs = 3_000, now = Date.now }) {
  /** @type {Map<string, { exists: boolean, at: number }>} */
  const cache = new Map();
  /** @type {Map<string, Promise<void>>} */
  const inflight = new Map();

  const fresh = (e) => e && now() - e.at < (e.exists ? okTtlMs : missTtlMs);

  return {
    /**
     * @param {string} root  cache namespace (worktree path)
     * @param {string[]} paths repo-relative
     * @returns {Promise<Set<string>>} the subset that exists
     */
    async existing(root, paths) {
      const key = (p) => `${root}\0${p}`;
      const todo = [...new Set(paths)].filter((p) => !fresh(cache.get(key(p))) && !inflight.has(key(p)));

      if (todo.length > 0) {
        const req = (async () => {
          const res = await Promise.resolve().then(() => check(todo)).catch(() => null);

          const at = now();

          for (const p of todo) cache.set(key(p), { exists: Boolean(res?.[p]), at });
        })();

        for (const p of todo) inflight.set(key(p), req);
        req.finally(() => todo.forEach((p) => inflight.delete(key(p))));
      }

      await Promise.all(paths.map((p) => inflight.get(key(p))).filter(Boolean));

      return new Set(paths.filter((p) => cache.get(key(p))?.exists));
    },
  };
}

/**
 * Read the logical (unwrapped) line containing buffer row `y0` (0-based).
 * @returns {{ text: string, startRow: number, cols: number }}
 */
export function readLogicalLine(term, y0) {
  const buf = term.buffer.active;
  const cols = term.cols;
  let start = y0;

  while (start > 0 && buf.getLine(start)?.isWrapped) start--;
  let end = y0;

  while (buf.getLine(end + 1)?.isWrapped) end++;

  let text = '';

  for (let r = start; r <= end; r++) {
    const line = buf.getLine(r);
    text += line ? line.translateToString(r === end) : '';
  }

  return { text, startRow: start, cols };
}

/**
 * @param {import('@xterm/xterm').Terminal} term
 * @param {{
 *   getRoot: () => string | null | undefined,
 *   getCwd: () => string | null | undefined,
 *   exists: ReturnType<typeof createExistenceCache>,
 *   openFile: (path: string, line: number | null, col: number | null) => void,
 *   openUrl: (url: string) => void,
 *   isMac?: boolean,
 * }} deps
 * @returns {import('@xterm/xterm').IDisposable}
 */
export function registerTerminalLinks(term, { getRoot, getCwd, exists, openFile, openUrl, isMac = false }) {
  return term.registerLinkProvider({
    async provideLinks(y, callback) {
      try {
        const { text, startRow, cols } = readLogicalLine(term, y - 1);
        const found = findLinks(text);

        if (found.length === 0) return callback(undefined);

        const root = getRoot();
        const cwd = getCwd();
        const rowOf = (off) => startRow + Math.floor(off / cols);

        // Only links touching the requested row; xterm asks per row.
        const here = found.filter((l) => rowOf(l.start) <= y - 1 && rowOf(l.end - 1) >= y - 1);

        const withCandidates = here.map((l) => ({
          l,
          candidates: l.kind === 'file' ? resolveRepoRelative(l.path, { root, cwd }) : [],
        }));

        const allCandidates = withCandidates.flatMap((w) => w.candidates);
        const present = allCandidates.length > 0 ? await exists.existing(root, allCandidates) : new Set();

        const links = [];

        for (const { l, candidates } of withCandidates) {
          let rel = null;

          if (l.kind === 'file') {
            rel = candidates.find((c) => present.has(c)) ?? null;

            if (!rel) continue;
          }

          links.push({
            range: {
              start: { x: (l.start % cols) + 1, y: rowOf(l.start) + 1 },
              end: { x: ((l.end - 1) % cols) + 1, y: rowOf(l.end - 1) + 1 },
            },
            text: l.text,
            activate(event) {
              if (!isOpenModifier(event, isMac)) return;
              event.preventDefault?.();

              if (l.kind === 'url') openUrl(l.url);
              else openFile(rel, l.line ?? null, l.col ?? null);
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      } catch {
        callback(undefined);
      }
    },
  });
}
