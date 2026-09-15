const CONFLICT_MARKER_RE = /^<{7}( |$)/m;

/**
 * True when contents contain a conflict start marker at line start.
 * @param {string|undefined} contents
 */
export function hasConflictMarkers(contents) {
  return CONFLICT_MARKER_RE.test(contents ?? '');
}

/**
 * Human labels for the unmerged porcelain codes. X describes our side vs
 * the base, Y the other side (UD = we kept our change, they deleted).
 * @type {Record<string, string>}
 */
const KIND_LABELS = {
  UU: 'both modified',
  AA: 'both added',
  DD: 'both deleted',
  AU: 'added by us',
  UA: 'added by them',
  DU: 'deleted by us',
  UD: 'deleted by them',
};

/**
 * Label for a two-char unmerged porcelain code, or undefined.
 * @param {string} [code]
 * @returns {string|undefined}
 */
export function conflictKindLabel(code) {
  return KIND_LABELS[code ?? ''];
}

/** Badge glyphs per unmerged code: the file's nature (modified/added/deleted). */
const KIND_GLYPHS = {
  UU: 'M',
  AA: 'A',
  DD: 'D',
  AU: 'A',
  UA: 'A',
  DU: 'D',
  UD: 'D',
};

/**
 * Glyph for a two-char unmerged porcelain code, or undefined.
 * @param {string} [code]
 * @returns {string|undefined}
 */
export function conflictKindGlyph(code) {
  return KIND_GLYPHS[code ?? ''];
}

/**
 * Decides how ConflictViewer renders a conflicted path from a
 * GetConflictFile result. Modify/delete conflicts leave the surviving
 * version in the worktree without markers, so the index stages drive the
 * ours/theirs comparison.
 *
 * @param {string} path
 * @param {{
 *   hasWorktree?: boolean, worktree?: string,
 *   hasOurs?: boolean, ours?: string,
 *   hasTheirs?: boolean, theirs?: string,
 * }|null|undefined} res
 * @returns {{
 *   loading: boolean,
 *   view: {
 *     kind: 'markers'|'sides'|'plain',
 *     path: string,
 *     contents?: string,
 *     ours?: string|null,
 *     theirs?: string|null,
 *   }|{ kind: 'deleted' }|null,
 * }}
 */
export function conflictViewFromStages(path, res) {
  const r = res ?? {};
  const hasWorktree = !!r.hasWorktree;
  const hasOurs = !!r.hasOurs;
  const hasTheirs = !!r.hasTheirs;

  if (!hasWorktree && !hasOurs && !hasTheirs) {
    return { loading: false, view: { kind: 'deleted' } };
  }
  if (hasWorktree && hasConflictMarkers(r.worktree)) {
    return {
      loading: false,
      view: { kind: 'markers', path, contents: r.worktree ?? '' },
    };
  }
  if (hasOurs || hasTheirs) {
    return {
      loading: false,
      view: {
        kind: 'sides',
        path,
        ours: hasOurs ? r.ours : null,
        theirs: hasTheirs ? r.theirs : null,
      },
    };
  }
  return {
    loading: false,
    view: { kind: 'plain', path, contents: r.worktree ?? '' },
  };
}
