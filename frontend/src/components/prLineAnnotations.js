/**
 * Map GitHub review-comment sides to Pierre AnnotationSide.
 * Pierre only accepts 'additions' | 'deletions'; GitHub uses LEFT/RIGHT.
 *
 * @param {string | undefined | null} side
 * @returns {'additions' | 'deletions'}
 */
export function toPierreSide(side) {
  const s = typeof side === 'string' ? side.toLowerCase() : '';
  if (s === 'left' || s === 'deletions') return 'deletions';
  return 'additions';
}

/**
 * Build Pierre DiffLineAnnotation list for the active PR file.
 * Returns undefined when there is nothing to render (do not pass [] with a
 * renderAnnotation that expects metadata).
 *
 * @param {{
 *   isPRMode: boolean,
 *   comments: Array<{
 *     path?: string,
 *     line?: number | null,
 *     side?: string,
 *     body?: string,
 *     user?: { login?: string },
 *   }>,
 *   filename: string,
 * }} opts
 * @returns {Array<{
 *   lineNumber: number,
 *   side: 'additions' | 'deletions',
 *   metadata: { body?: string, user?: { login?: string } },
 * }> | undefined}
 */
export function buildPRLineAnnotations({ isPRMode, comments, filename }) {
  if (!isPRMode || !comments?.length || !filename) return undefined;

  const mapped = [];
  for (const c of comments) {
    if (c.path !== filename || c.line == null) continue;
    mapped.push({
      lineNumber: c.line,
      side: toPierreSide(c.side),
      metadata: { body: c.body, user: c.user },
    });
  }
  return mapped.length ? mapped : undefined;
}
