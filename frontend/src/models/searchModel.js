/**
 * Pure helpers for rendering code-location results (references and the
 * text-search fallback). Results are repo-relative, 1-based.
 *
 * @typedef {{ path: string, line: number, col: number, text: string, len?: number }} ResultItem
 */

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
