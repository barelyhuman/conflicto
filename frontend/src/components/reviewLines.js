/**
 * Pure helpers for mapping Pierre line selections to GitHub review-comment
 * coordinates, validating them against a patch, and parsing clipboard refs.
 */

/** Pierre side → GitHub side. Deletions are LEFT; additions and context are RIGHT. */
export function toGitHubSide(side) {
  return side === 'deletions' ? 'LEFT' : 'RIGHT';
}

/**
 * Convert a Pierre SelectedLineRange to GitHub review comment coordinates.
 * Single line → { line, side }; multi-line → also start_line/start_side
 * (camelCase here: startLine/startSide).
 *
 * @param {{ start: number, end: number, side?: string, endSide?: string }|null|undefined} range
 * @returns {{ line: number, side: 'LEFT'|'RIGHT', startLine?: number, startSide?: 'LEFT'|'RIGHT' }|null}
 */
export function rangeToLocation(range) {
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return null;

  const startSide = toGitHubSide(range.side);
  const endSide = toGitHubSide(range.endSide ?? range.side);
  let a = { n: range.start, side: startSide };
  let b = { n: range.end, side: endSide };

  // Same side: order numerically. Mixed sides: keep selection order.
  if (startSide === endSide && a.n > b.n) [a, b] = [b, a];

  if (a.n === b.n && a.side === b.side) return { line: b.n, side: b.side };

  return { line: b.n, side: b.side, startLine: a.n, startSide: a.side };
}

/** Inverse of rangeToLocation, for driving Pierre's `selectedLines`. */
export function locationToRange(loc) {
  const side = loc.side === 'LEFT' ? 'deletions' : 'additions';

  if (loc.startLine == null) return { start: loc.line, end: loc.line, side, endSide: side };
  const startSide = loc.startSide === 'LEFT' ? 'deletions' : 'additions';

  return { start: loc.startLine, side: startSide, end: loc.line, endSide: side };
}

/**
 * Collect line numbers present on each side of a unified-diff patch.
 * @param {string|null|undefined} patch
 * @returns {{ left: Set<number>, right: Set<number> }}
 */
export function parsePatchLines(patch) {
  const left = new Set();
  const right = new Set();

  if (!patch) return { left, right };

  let l = 0;
  let r = 0;
  let inHunk = false;

  for (const raw of patch.split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);

    if (m) {
      l = Number(m[1]);
      r = Number(m[2]);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;
    const c = raw[0];

    if (c === '+') right.add(r++);
    else if (c === '-') left.add(l++);
    else if (c === ' ') {
      left.add(l++);
      right.add(r++);
    }
  }

  return { left, right };
}

/** Whether (side, line) exists in the patch. */
export function lineInPatch(patch, side, line) {
  const { left, right } = parsePatchLines(patch);

  return (side === 'LEFT' ? left : right).has(line);
}

/**
 * A draft is outdated when the PR head moved since it was written AND its
 * line(s) no longer exist in the file's current patch. Unknown patch → not outdated.
 *
 * @param {{ headSHA?: string, line: number, side: string, startLine?: number, startSide?: string }} draft
 * @param {{ currentHeadSHA?: string, patch?: string|null }} ctx
 */
export function isDraftOutdated(draft, { currentHeadSHA, patch }) {
  if (!draft.headSHA || !currentHeadSHA || draft.headSHA === currentHeadSHA) return false;
  if (patch == null) return false;

  const { left, right } = parsePatchLines(patch);
  const has = (side, n) => (side === 'LEFT' ? left : right).has(n);

  if (!has(draft.side, draft.line)) return true;
  if (draft.startLine && !has(draft.startSide ?? draft.side, draft.startLine)) return true;

  return false;
}

/**
 * Parse a leading `path:line` or `path:start-end` reference from clipboard
 * text and match it against PR file paths (exact, then path-suffix either way).
 *
 * @param {string} text
 * @param {string[]} paths
 * @returns {{ path: string, startLine: number, endLine: number, rest: string }|null}
 */
export function parseClipboardRef(text, paths) {
  if (!text) return null;

  const m =
    /^\s*[`"'([]*([\w@.\-/\\]+?):(\d+)(?:[-–](\d+))?(?::\d+)?[`"')\]]*[\s:—–-]*/u.exec(text);

  if (!m) return null;

  const ref = m[1].replace(/\\/g, '/').replace(/^\.\//, '');
  const a = Number(m[2]);
  const b = m[3] ? Number(m[3]) : a;

  if (!Number.isFinite(a) || a <= 0) return null;

  let path = paths.find((p) => p === ref);

  if (!path) {
    const cands = paths.filter((p) => p.endsWith(`/${ref}`) || ref.endsWith(`/${p}`));

    if (cands.length === 1) path = cands[0];
  }

  if (!path) return null;

  return {
    path,
    startLine: Math.min(a, b),
    endLine: Math.max(a, b),
    rest: text.slice(m[0].length).replace(/^\n+/, ''),
  };
}

/**
 * Build a composer location from a clipboard ref, preferring the RIGHT side
 * unless the lines only exist on the LEFT of the patch.
 */
export function refToLocation(ref, patch) {
  const { left, right } = parsePatchLines(patch);
  let side = 'RIGHT';

  if (patch && !right.has(ref.endLine) && left.has(ref.endLine)) side = 'LEFT';

  if (ref.startLine === ref.endLine) return { line: ref.endLine, side };

  return { line: ref.endLine, side, startLine: ref.startLine, startSide: side };
}
