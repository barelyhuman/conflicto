import { signal, batch } from '@preact/signals';

/**
 * Global text search (ripgrep via the Go backend). Plain signals + actions;
 * the sidebar panel renders them. Results are repo-relative, 1-based.
 *
 * @typedef {{ path: string, line: number, col: number, text: string, len?: number }} ResultItem
 */

export const SEARCH_LIMIT = 500;

/**
 * [start, end) character range of the match inside `item.text`, or null.
 * References/definition results carry `len`; search results are matched again
 * client-side with the same options the user typed.
 * @param {ResultItem} item
 * @param {{ query: string, regex: boolean, caseSensitive: boolean, wholeWord: boolean }} [spec]
 */
export function matchRange(item, spec) {
  const start = Math.max(0, item.col - 1);

  if (item.len) return [start, Math.min(item.text.length, start + item.len)];

  if (!spec?.query) return null;

  try {
    const body = spec.regex ? spec.query : spec.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(spec.wholeWord ? `\\b(?:${body})\\b` : body, spec.caseSensitive ? 'g' : 'gi');
    re.lastIndex = start;
    const m = re.exec(item.text);

    if (m && m[0].length) return [m.index, m.index + m[0].length];
  } catch {
    // invalid regex: no highlight
  }

  return [start, Math.min(item.text.length, start + Math.max(1, spec.query.length))];
}

/**
 * Preview split into text before / inside / after the match, with leading
 * indentation trimmed.
 * @param {ResultItem} item @param {Parameters<typeof matchRange>[1]} [spec]
 */
export function splitPreview(item, spec) {
  const text = item.text ?? '';
  const trimmed = text.trimStart();
  const shift = text.length - trimmed.length;
  const range = matchRange({ ...item, text }, spec);

  if (!range) return { pre: trimmed, hit: '', post: '' };
  const start = Math.max(0, range[0] - shift);
  const end = Math.max(start, range[1] - shift);

  return { pre: trimmed.slice(0, start), hit: trimmed.slice(start, end), post: trimmed.slice(end) };
}

/** Group a flat, path-ordered result list by file. @param {ResultItem[]} items */
export function groupByFile(items) {
  /** @type {{ path: string, items: ResultItem[] }[]} */
  const groups = [];
  /** @type {Map<string, { path: string, items: ResultItem[] }>} */
  const byPath = new Map();

  for (const item of items) {
    let g = byPath.get(item.path);

    if (!g) {
      g = { path: item.path, items: [] };
      byPath.set(item.path, g);
      groups.push(g);
    }

    g.items.push(item);
  }

  return groups;
}

const isCancel = (err) => /cancel/i.test(err?.message ?? String(err));

/**
 * @param {{
 *   api: { searchText: (opts: object) => Promise<ResultItem[]> },
 *   openFileAt: (path: string, line?: number | null, col?: number | null) => unknown,
 *   debounceMs?: number,
 *   limit?: number,
 * }} deps
 */
export function createSearchModel({ api, openFileAt, debounceMs = 250, limit = SEARCH_LIMIT }) {
  const query = signal('');
  const glob = signal('');
  const caseSensitive = signal(false);
  const wholeWord = signal(false);
  const regex = signal(false);
  const results = signal(/** @type {ResultItem[]} */ ([]));
  const status = signal(/** @type {'idle'|'searching'|'done'|'error'} */ ('idle'));
  const error = signal('');
  const capped = signal(false);
  /** The options the visible results were produced with (for highlighting). */
  const spec = signal({ query: '', regex: false, caseSensitive: false, wholeWord: false });
  /** Incremented to ask the input to take focus (⌘⇧F). */
  const focusTick = signal(0);
  /** Sidebar view: 'changes' | 'search'. */
  const mode = signal(/** @type {'changes'|'search'} */ ('changes'));
  let timer = null;
  let runId = 0;

  async function run() {
    const q = query.peek();
    const id = ++runId;

    if (!q.trim()) {
      batch(() => {
        results.value = [];
        status.value = 'idle';
        error.value = '';
        capped.value = false;
      });

      return;
    }

    status.value = 'searching';
    const opts = {
      query: q,
      regex: regex.peek(),
      caseSensitive: caseSensitive.peek(),
      wholeWord: wholeWord.peek(),
      glob: glob.peek().trim(),
      limit,
    };

    try {
      const found = (await api.searchText(opts)) ?? [];

      if (id !== runId) return;
      batch(() => {
        results.value = found;
        capped.value = found.length >= limit;
        spec.value = {
          query: q,
          regex: opts.regex,
          caseSensitive: opts.caseSensitive,
          wholeWord: opts.wholeWord,
        };
        error.value = '';
        status.value = 'done';
      });
    } catch (err) {
      // A superseded search is cancelled by the backend; the newer run owns the state.
      if (id !== runId || isCancel(err)) return;
      batch(() => {
        results.value = [];
        capped.value = false;
        error.value = err?.message ?? String(err);
        status.value = 'error';
      });
    }
  }

  return {
    query,
    glob,
    caseSensitive,
    wholeWord,
    regex,
    results,
    status,
    error,
    capped,
    spec,
    focusTick,
    mode,

    /** Debounced re-run; call after any input change. */
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    },

    /** Run now (Enter). */
    runNow() {
      clearTimeout(timer);

      return run();
    },

    toggle(which) {
      const s = { case: caseSensitive, word: wholeWord, regex }[which];

      if (!s) return;
      s.value = !s.peek();
      this.schedule();
    },

    /** Show the search view and focus its input (⌘⇧F). Seeds the query from a selection. */
    open(seed) {
      mode.value = 'search';

      if (seed && seed !== query.peek()) {
        query.value = seed;
        this.schedule();
      }

      focusTick.value += 1;
    },

    showChanges() {
      mode.value = 'changes';
    },

    openResult(item) {
      openFileAt(item.path, item.line, item.col);
    },

    dispose() {
      clearTimeout(timer);
      runId += 1;
    },
  };
}
