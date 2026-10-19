import { describe, expect, it } from 'vitest';
import {
  activePatch,
  beginPatch,
  dropPatches,
  emptyFileSet,
  fileIndex,
  patchPending,
  putPatch,
  stepPath,
  withList,
} from './fileSet.js';

const files = [{ path: 'a.go' }, { path: 'b.go' }, { path: 'c.go' }];

describe('fileSet', () => {
  it('keeps a selection that is still in the list and otherwise takes the first file', () => {
    const kept = withList({ ...emptyFileSet(), selected: 'b.go' }, files);

    expect(kept.selected).toBe('b.go');
    expect(fileIndex(kept)).toBe(1);
    expect(withList(kept, [{ path: 'c.go' }]).selected).toBe('c.go');
    expect(withList(kept, []).selected).toBeNull();
  });

  it('steps through the list and wraps', () => {
    expect(stepPath(files, 'a.go', 1)).toBe('b.go');
    expect(stepPath(files, 'a.go', -1)).toBe('c.go');
    expect(stepPath(files, null, 1)).toBe('a.go');
    expect(stepPath([], 'a.go', 1)).toBeNull();
  });

  it('stores a patch for one path and reports loading only while that patch is missing', () => {
    let set = beginPatch(withList(emptyFileSet(), files), 'a.go');

    expect(patchPending(set)).toBe(true);
    expect(activePatch(set)).toBeNull();
    set = putPatch(set, 'a.go', { path: 'a.go', patch: 'p' });
    expect(patchPending(set)).toBe(false);
    expect(activePatch(set)).toEqual({ path: 'a.go', patch: 'p' });
    expect(dropPatches(set, 'a.go').patches).toEqual({ 'a.go': { path: 'a.go', patch: 'p' } });
    expect(dropPatches(set).patches).toEqual({});
  });
});
