/**
 * Position conversions between LSP (0-based line, UTF-16 character) and
 * CodeMirror document offsets (UTF-16 code units, so the character maps 1:1).
 * `doc` is anything shaped like a CodeMirror Text.
 *
 * @typedef {{ line: number, character: number }} LspPosition
 * @typedef {{ start: LspPosition, end: LspPosition }} LspRange
 */

/** @param {any} doc @param {number} offset @returns {LspPosition} */
export function offsetToPosition(doc, offset) {
  const o = Math.max(0, Math.min(offset, doc.length));
  const line = doc.lineAt(o);

  return { line: line.number - 1, character: o - line.from };
}

/** Clamp into the document (servers may report stale or out-of-range positions). */
export function positionToOffset(doc, pos) {
  if (pos.line < 0) return 0;

  if (pos.line >= doc.lines) return doc.length;
  const line = doc.line(pos.line + 1);

  return line.from + Math.max(0, Math.min(pos.character, line.length));
}

/** @param {any} doc @param {LspRange} range */
export function rangeToOffsets(doc, range) {
  return [positionToOffset(doc, range.start), positionToOffset(doc, range.end)];
}

/**
 * Convert a CodeMirror ChangeSet applied to `startDoc` into LSP incremental
 * content changes. LSP applies them in order, so they are emitted from the end
 * of the document backwards: each change's coordinates (in the pre-change
 * document) stay valid after the later ones were applied.
 *
 * @param {any} startDoc document before the transaction
 * @param {{ iterChanges: (f: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string }) => void) => void }} changes
 */
export function changesToLsp(startDoc, changes) {
  const out = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    out.push({
      range: { start: offsetToPosition(startDoc, fromA), end: offsetToPosition(startDoc, toA) },
      text: inserted.toString(),
    });
  });

  return out.reverse();
}
