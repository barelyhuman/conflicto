import { EditorState } from '@codemirror/state';

/**
 * CodeMirror normalises line breaks to "\n" unless told otherwise, so saving a
 * CRLF file would rewrite every line ending. Files that contain CRLF keep it:
 * read the document back with `state.sliceDoc(0)` (not `doc.toString()`).
 *
 * @param {string} text
 */
export function lineSeparatorExtension(text) {
  return text.includes('\r\n') ? EditorState.lineSeparator.of('\r\n') : [];
}
