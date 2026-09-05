/** GitHub LEFT/RIGHT → Pierre additions/deletions. */
export function toPierreSide(side) {
  const s = typeof side === 'string' ? side.toLowerCase() : '';
  if (s === 'left' || s === 'deletions') return 'deletions';
  return 'additions';
}

/**
 * Pierre DiffLineAnnotation list for the active PR file.
 * Returns undefined (not []) when empty so renderAnnotation is omitted.
 */
export function buildPRLineAnnotations({ isPRMode, comments, filename }) {
  if (!isPRMode || !comments?.length || !filename) return undefined;

  const mapped = [];
  for (const c of comments) {
    if (c.path !== filename || c.line == null) continue;
    mapped.push({
      lineNumber: c.line,
      side: toPierreSide(c.side),
      metadata: { body: c.body, user: c.user, html_url: c.html_url },
    });
  }
  return mapped.length ? mapped : undefined;
}
