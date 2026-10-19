/**
 * Pure logic behind SearchableMenu: ranking, active-index movement, key mapping.
 *
 * Item shape: { id, label, sublabel?, keywords?, group?, current? }.
 * Query: space-separated tokens, ALL must fuzzy-match (label, sublabel or keywords).
 */
import { fuzzyMatch } from './palette/fuzzy.js';

const LABEL_BONUS = 8;
const KEYWORD_PENALTY = 2;

/**
 * Best match of one token over an item's fields.
 * @returns {{ score: number, field: 'label'|'sublabel'|'keyword', indices: number[] } | null}
 */
function matchToken(token, item) {
  let best = null;

  function consider(text, field, bonus) {
    if (!text) return;
    const r = fuzzyMatch(token, text);

    if (!r) return;
    const score = r.score + bonus;

    if (!best || score > best.score) best = { score, field, indices: r.indices };
  }

  consider(item.label ?? '', 'label', LABEL_BONUS);
  consider(item.sublabel ?? '', 'sublabel', 0);

  for (const k of item.keywords ?? []) consider(k, 'keyword', -KEYWORD_PENALTY);

  return best;
}

/**
 * Filter and rank items. Empty query keeps the input order. Grouped items stay
 * grouped (groups ordered by first appearance); ranking applies within a group.
 *
 * @template {{ id: string, label: string, sublabel?: string, keywords?: string[], group?: string }} T
 * @param {T[]} items
 * @param {string} query
 * @returns {{ item: T, score: number, indices: number[], subIndices: number[], pos: number }[]}
 */
export function rankItems(items, query) {
  const tokens = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];

  items.forEach((item, order) => {
    let score = 0;
    const idx = new Set();
    const subIdx = new Set();
    let ok = true;

    for (const tok of tokens) {
      const m = matchToken(tok, item);

      if (!m) {
        ok = false;
        break;
      }

      score += m.score;

      if (m.field === 'label') m.indices.forEach((i) => idx.add(i));
      else if (m.field === 'sublabel') m.indices.forEach((i) => subIdx.add(i));
    }

    if (!ok) return;
    scored.push({
      item,
      score,
      order,
      indices: [...idx].sort((a, b) => a - b),
      subIndices: [...subIdx].sort((a, b) => a - b),
    });
  });

  if (tokens.length) scored.sort((a, b) => b.score - a.score || a.order - b.order);

  const groupOrder = [];

  for (const it of items) {
    if (it.group != null && !groupOrder.includes(it.group)) groupOrder.push(it.group);
  }

  if (groupOrder.length) {
    const rank = (r) => (r.item.group == null ? -1 : groupOrder.indexOf(r.item.group));
    // Array#sort is stable: relative order within a group is preserved.
    scored.sort((a, b) => rank(a) - rank(b));
  }

  return scored.map(({ item, score, indices, subIndices }, pos) => ({ item, score, indices, subIndices, pos }));
}

/**
 * Move the active index with wraparound.
 * @param {number} active current index (-1 for none)
 * @param {number} delta +1 / -1
 * @param {number} count
 * @returns {number} -1 when count is 0
 */
export function moveActive(active, delta, count) {
  if (count <= 0) return -1;

  if (active < 0 || active >= count) return delta > 0 ? 0 : count - 1;

  return (((active + delta) % count) + count) % count;
}

/** Esc clears a non-empty query first, closes on the next press. */
export function escapeStep(query) {
  return query ? 'clear' : 'close';
}

/** Index to activate when the result list changes. */
export function initialActive(results, query) {
  if (!results.length) return -1;

  if (!query.trim()) {
    const i = results.findIndex((r) => r.item.current);

    if (i >= 0) return i;
  }

  return 0;
}

/**
 * Map a keydown to a menu action.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, isComposing?: boolean }} e
 * @returns {'next'|'prev'|'select'|'escape'|null}
 */
export function keyAction(e) {
  if (e.isComposing) return null;

  if (e.key === 'ArrowDown') return 'next';

  if (e.key === 'ArrowUp') return 'prev';

  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'n') return 'next';

    if (e.key === 'p') return 'prev';
  }

  if (e.key === 'Enter' && !e.shiftKey) return 'select';

  if (e.key === 'Escape') return 'escape';

  return null;
}
