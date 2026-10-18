/** GitHub LEFT/RIGHT → Pierre additions/deletions. */
export function toPierreSide(side) {
  const s = String(side ?? '').toLowerCase();

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

/**
 * Full annotation list for a PR file: posted comments, pending drafts and the
 * open composer. Kind is carried in metadata so one renderer can switch.
 *
 * @param {{
 *   isPRMode: boolean, comments?: object[], drafts?: object[],
 *   composer?: { path: string, editId: string|null, loc: { line: number, side: string }, rev: number }|null,
 *   filename: string, outdatedIds?: Set<string>,
 * }} args
 */
export function buildReviewAnnotations({
  isPRMode,
  comments,
  drafts,
  composer,
  filename,
  outdatedIds,
}) {
  if (!isPRMode || !filename) return undefined;

  const out = [...(buildPRLineAnnotations({ isPRMode, comments, filename }) ?? [])];

  for (const d of drafts ?? []) {
    if (d.path !== filename || composer?.editId === d.id) continue;
    out.push({
      lineNumber: d.line,
      side: toPierreSide(d.side),
      metadata: { kind: 'draft', draft: d, outdated: !!outdatedIds?.has(d.id) },
    });
  }

  if (composer && composer.path === filename) {
    out.push({
      lineNumber: composer.loc.line,
      side: toPierreSide(composer.loc.side),
      metadata: { kind: 'composer', composerRev: composer.rev },
    });
  }

  return out.length ? out : undefined;
}
