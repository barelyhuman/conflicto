/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { mapDiffLineToEditorLine } from './diffLineToEditorLine.js';

/**
 * @param {string} lineType
 * @param {number} lineNumber
 * @returns {HTMLElement}
 */
function makeLine(lineType, lineNumber) {
  const el = document.createElement('div');
  el.dataset.line = String(lineNumber);
  el.dataset.lineType = lineType;
  return el;
}

describe('mapDiffLineToEditorLine', () => {
  it('returns null for invalid line numbers', () => {
    expect(mapDiffLineToEditorLine({ lineNumber: 0 })).toBeNull();
    expect(mapDiffLineToEditorLine({ lineNumber: NaN })).toBeNull();
    expect(mapDiffLineToEditorLine({})).toBeNull();
  });

  it('maps context and addition lines to the new-file line number', () => {
    expect(
      mapDiffLineToEditorLine({
        lineNumber: 10,
        lineType: 'context',
        annotationSide: 'additions',
      })
    ).toBe(10);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 42,
        lineType: 'change-addition',
        annotationSide: 'additions',
      })
    ).toBe(42);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 7,
        lineType: 'context-expanded',
        annotationSide: 'additions',
      })
    ).toBe(7);
  });

  it('uses the next non-deletion sibling for deletion-only rows', () => {
    const parent = document.createElement('div');
    const deletion = makeLine('change-deletion', 5);
    const addition = makeLine('change-addition', 5);
    parent.append(deletion, addition);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 5,
        lineType: 'change-deletion',
        annotationSide: 'deletions',
        lineElement: deletion,
      })
    ).toBe(5);
  });

  it('falls back to previous non-deletion sibling when nothing follows', () => {
    const parent = document.createElement('div');
    const context = makeLine('context', 8);
    const deletion = makeLine('change-deletion', 9);
    parent.append(context, deletion);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 9,
        lineType: 'change-deletion',
        annotationSide: 'deletions',
        lineElement: deletion,
      })
    ).toBe(8);
  });

  it('falls back to the deletion line number when no siblings exist', () => {
    const deletion = makeLine('change-deletion', 3);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 3,
        lineType: 'change-deletion',
        annotationSide: 'deletions',
        lineElement: deletion,
      })
    ).toBe(3);
  });

  it('skips intervening deletion siblings when finding nearest', () => {
    const parent = document.createElement('div');
    const d1 = makeLine('change-deletion', 4);
    const d2 = makeLine('change-deletion', 5);
    const addition = makeLine('change-addition', 4);
    parent.append(d1, d2, addition);

    expect(
      mapDiffLineToEditorLine({
        lineNumber: 4,
        lineType: 'change-deletion',
        annotationSide: 'deletions',
        lineElement: d1,
      })
    ).toBe(4);
  });
});
