import { describe, expect, it, vi } from 'vitest';
import {
  annotationUnsafeCSS,
  expandUnchangedForDiff,
  fileDiffFromPatch,
  loadDiffFilesForDiff,
  mapFileContentsToDiffFiles,
} from './pierreDiffOptions.js';

describe('expandUnchangedForDiff', () => {
  it('forces false in PR mode even when fullDiff is true', () => {
    expect(expandUnchangedForDiff(true, true)).toBe(false);
    expect(expandUnchangedForDiff(true, false)).toBe(false);
  });

  it('mirrors fullDiff in working-tree mode', () => {
    expect(expandUnchangedForDiff(false, true)).toBe(true);
    expect(expandUnchangedForDiff(false, false)).toBe(false);
  });
});

describe('annotationUnsafeCSS', () => {
  it('returns annotation CSS only in PR mode', () => {
    expect(annotationUnsafeCSS(true)).toContain('--diffs-annotation-bg: transparent');
    expect(annotationUnsafeCSS(false)).toBeUndefined();
  });
});

describe('loadDiffFilesForDiff', () => {
  it('omits the loader in PR mode', () => {
    const loader = vi.fn();
    expect(loadDiffFilesForDiff(true, loader)).toBeUndefined();
  });

  it('passes the loader through in working-tree mode', () => {
    const loader = vi.fn();
    expect(loadDiffFilesForDiff(false, loader)).toBe(loader);
  });
});

describe('fileDiffFromPatch', () => {
  it('returns null for empty patch', () => {
    expect(fileDiffFromPatch('')).toBeNull();
    expect(fileDiffFromPatch(null)).toBeNull();
  });

  it('returns metadata when the patch has hunks', () => {
    const meta = fileDiffFromPatch(`diff --git a/a.js b/a.js
index 111..222 100644
--- a/a.js
+++ b/a.js
@@ -1 +1 @@
-old
+new
`);
    expect(meta?.hunks?.length).toBe(1);
  });
});

describe('mapFileContentsToDiffFiles', () => {
  const meta = { name: 'src/a.js', prevName: 'src/old.js' };

  it('returns both sides when hasOld and hasNew', () => {
    expect(
      mapFileContentsToDiffFiles(meta, {
        hasOld: true,
        hasNew: true,
        oldContent: 'old',
        newContent: 'new',
      })
    ).toEqual({
      oldFile: { name: 'src/old.js', contents: 'old' },
      newFile: { name: 'src/a.js', contents: 'new' },
    });
  });

  it('uses empty newFile contents when hasNew is false (deletion-heavy)', () => {
    expect(
      mapFileContentsToDiffFiles(meta, {
        hasOld: true,
        hasNew: false,
        oldContent: 'gone',
      })
    ).toEqual({
      oldFile: { name: 'src/old.js', contents: 'gone' },
      newFile: { name: 'src/a.js', contents: '' },
    });
  });

  it('returns rename-pure shape when only new exists', () => {
    expect(
      mapFileContentsToDiffFiles(
        { name: 'src/a.js' },
        { hasOld: false, hasNew: true, newContent: 'fresh' }
      )
    ).toEqual({
      oldFile: null,
      newFile: { name: 'src/a.js', contents: 'fresh' },
    });
  });

  it('treats empty-string contents as present when hasNew/hasOld', () => {
    expect(
      mapFileContentsToDiffFiles(meta, {
        hasOld: true,
        hasNew: true,
        oldContent: '',
        newContent: '',
      })
    ).toEqual({
      oldFile: { name: 'src/old.js', contents: '' },
      newFile: { name: 'src/a.js', contents: '' },
    });
  });

  it('falls back to path name when prevName is missing', () => {
    expect(
      mapFileContentsToDiffFiles(
        { name: 'src/a.js' },
        { hasOld: true, hasNew: true, oldContent: 'a', newContent: 'b' }
      ).oldFile.name
    ).toBe('src/a.js');
  });
});
