import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { lineSeparatorExtension } from './lineSeparator.js';

const roundTrip = (text) =>
  EditorState.create({ doc: text, extensions: [lineSeparatorExtension(text)] }).sliceDoc(0);

describe('lineSeparatorExtension', () => {
  it('keeps CRLF files CRLF when the document is read back for saving', () => {
    expect(roundTrip('a\r\nb\r\n')).toBe('a\r\nb\r\n');
  });

  it('leaves LF files alone', () => {
    expect(roundTrip('a\nb\n')).toBe('a\nb\n');
  });

  it('preserves the text of a file with a single line and no newline', () => {
    expect(roundTrip('abc')).toBe('abc');
  });
});
