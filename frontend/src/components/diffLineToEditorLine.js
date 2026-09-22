/**
 * Map a Pierre FileDiff line-click payload to a 1-based worktree (new-file) line.
 *
 * Context / addition rows use the new-file gutter number directly.
 * Deletion-only rows look for the nearest following (then preceding) non-deletion
 * sibling in the DOM; otherwise fall back to `lineNumber` for clamp-on-attach.
 *
 * @param {{
 *   lineNumber?: number,
 *   lineType?: string,
 *   annotationSide?: 'deletions' | 'additions',
 *   lineElement?: HTMLElement | null,
 * }} props
 * @returns {number | null}
 */
export function mapDiffLineToEditorLine(props) {
  const lineNumber = props?.lineNumber;
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return null;

  const lineType = props.lineType;
  const isDeletion =
    lineType === 'change-deletion' ||
    (lineType !== 'change-addition' &&
      lineType !== 'context' &&
      lineType !== 'context-expanded' &&
      props.annotationSide === 'deletions');

  if (!isDeletion) {
    return Math.floor(lineNumber);
  }

  const nearest = nearestNonDeletionLine(props.lineElement);
  if (nearest != null) return nearest;

  return Math.floor(lineNumber);
}

/**
 * @param {HTMLElement | null | undefined} lineElement
 * @returns {number | null}
 */
function nearestNonDeletionLine(lineElement) {
  if (!(lineElement instanceof HTMLElement)) return null;

  const forward = scanSiblingLines(lineElement, 'nextElementSibling');
  if (forward != null) return forward;

  return scanSiblingLines(lineElement, 'previousElementSibling');
}

/**
 * @param {HTMLElement} start
 * @param {'nextElementSibling' | 'previousElementSibling'} direction
 * @returns {number | null}
 */
function scanSiblingLines(start, direction) {
  let el = start[direction];
  while (el) {
    if (el instanceof HTMLElement && el.dataset.line != null) {
      if (el.dataset.lineType !== 'change-deletion') {
        const n = parseInt(el.dataset.line, 10);
        if (Number.isFinite(n) && n >= 1) return n;
      }
    }
    el = el[direction];
  }
  return null;
}
