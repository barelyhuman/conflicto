import { processFile } from '@pierre/diffs';

export function expandUnchangedForDiff(isPRMode, fullDiff) {
  return isPRMode ? false : !!fullDiff;
}

/**
 * Parse a git patch the same way DiffViewer does before mounting FileDiff.
 * @param {string|null|undefined} patch
 * @returns {import('@pierre/diffs').FileDiffMetadata|null}
 */
export function fileDiffFromPatch(patch) {
  if (!patch) return null;
  const meta = processFile(patch, { isGitDiff: true });
  if (!meta?.hunks?.length) return null;
  return meta;
}


export function annotationUnsafeCSS(isPRMode) {
  if (!isPRMode) return undefined;
  return `[data-line-annotation], [data-gutter-buffer="annotation"] { --diffs-annotation-bg: transparent; }`;
}

export function loadDiffFilesForDiff(isPRMode, loader) {
  return isPRMode ? undefined : loader;
}

/**
 * Map GetFileContents result into Pierre's loadDiffFiles shape.
 * Change hydration requires a non-null newFile — missing worktree/index
 * sides become empty contents so deletion-heavy diffs still hydrate.
 *
 * @param {{ name?: string, prevName?: string }} meta
 * @param {{ hasOld?: boolean, hasNew?: boolean, oldContent?: string, newContent?: string }|null|undefined} res
 * @returns {{ oldFile: { name: string, contents: string }|null, newFile: { name: string, contents: string } }}
 */
export function mapFileContentsToDiffFiles(meta, res) {
  const path = meta?.name ?? '';
  const oldName = meta?.prevName ?? path;
  const oldFile = res?.hasOld
    ? { name: oldName, contents: res.oldContent ?? '' }
    : null;
  const newFile = {
    name: path,
    contents: res?.hasNew ? (res.newContent ?? '') : '',
  };
  if (oldFile) return { oldFile, newFile };
  return { oldFile: null, newFile };
}
