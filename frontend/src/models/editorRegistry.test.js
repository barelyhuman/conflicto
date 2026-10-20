import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { offsetAt } from './editorRegistry.js';

describe('offsetAt', () => {
  const doc = Text.of(['hello', '', 'wörld!']);

  it('maps 1-based line and column', () => {
    expect(offsetAt(doc, 1, 1)).toBe(0);
    expect(offsetAt(doc, 1, 3)).toBe(2);
    expect(offsetAt(doc, 3, 2)).toBe(7 + 1);
  });

  it('clamps column to the line length and line to the document', () => {
    expect(offsetAt(doc, 1, 99)).toBe(5);
    expect(offsetAt(doc, 2, 5)).toBe(6);
    expect(offsetAt(doc, 99, 1)).toBe(7);
    expect(offsetAt(doc, 0, 0)).toBe(0);
  });
});
