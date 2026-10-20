import { describe, expect, it } from 'vitest';
import { ChangeSet, Text } from '@codemirror/state';
import { changesToLsp, offsetToPosition, positionToOffset, rangeToOffsets } from './positions.js';

const doc = Text.of(['héllo', '😀 two', '', 'last']);

describe('positions', () => {
  it('converts offsets to LSP positions (UTF-16 columns)', () => {
    expect(offsetToPosition(doc, 0)).toEqual({ line: 0, character: 0 });
    expect(offsetToPosition(doc, 3)).toEqual({ line: 0, character: 3 });
    // line 2 starts at 6; the emoji is two UTF-16 units
    expect(offsetToPosition(doc, 6 + 2)).toEqual({ line: 1, character: 2 });
    expect(offsetToPosition(doc, 6 + 4)).toEqual({ line: 1, character: 4 });
    expect(offsetToPosition(doc, 9999)).toEqual({ line: 3, character: 4 });
  });

  it('round-trips and clamps positions', () => {
    for (const o of [0, 2, 5, 6, 8, 12, 13, 14, doc.length]) {
      expect(positionToOffset(doc, offsetToPosition(doc, o))).toBe(o);
    }

    expect(positionToOffset(doc, { line: 0, character: 99 })).toBe(5);
    expect(positionToOffset(doc, { line: 99, character: 0 })).toBe(doc.length);
    expect(positionToOffset(doc, { line: -1, character: 0 })).toBe(0);
    expect(
      rangeToOffsets(doc, { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } })
    ).toEqual([1, 3]);
  });

  it('converts a multi-change transaction to sequentially valid LSP changes', () => {
    const start = Text.of(['abc', 'def']);
    const changes = ChangeSet.of(
      [
        { from: 1, to: 2, insert: 'XY' },
        { from: 5, to: 5, insert: '!' },
      ],
      start.length
    );
    const lsp = changesToLsp(start, changes);
    // last change first
    expect(lsp[0]).toEqual({
      range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
      text: '!',
    });
    expect(lsp[1].range.start).toEqual({ line: 0, character: 1 });

    // Applying them in order to the text reproduces the CodeMirror result.
    let lines = ['abc', 'def'];
    for (const c of lsp) {
      const text = lines.join('\n');
      const o = (p) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
      lines = (text.slice(0, o(c.range.start)) + c.text + text.slice(o(c.range.end))).split('\n');
    }

    expect(lines.join('\n')).toBe(changes.apply(start).toString());
  });
});
