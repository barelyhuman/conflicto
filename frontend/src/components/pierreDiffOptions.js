export function expandUnchangedForDiff(isPRMode, fullDiff) {
  return isPRMode ? false : !!fullDiff;
}

export function annotationUnsafeCSS(isPRMode) {
  if (!isPRMode) return undefined;
  return `[data-line-annotation], [data-gutter-buffer="annotation"] { --diffs-annotation-bg: transparent; }`;
}

export function loadDiffFilesForDiff(isPRMode, loader) {
  return isPRMode ? undefined : loader;
}
