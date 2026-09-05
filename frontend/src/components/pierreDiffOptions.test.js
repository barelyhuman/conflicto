import { describe, expect, it, vi } from 'vitest';
import {
  annotationUnsafeCSS,
  expandUnchangedForDiff,
  loadDiffFilesForDiff,
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
