/**
 * Map a pointer event inside Pierre's shadow DOM to a 1-based line + character.
 * Avoids relying on WKWebView shadow selectionchange / getComposedRanges.
 *
 * @param {ShadowRoot} shadowRoot
 * @param {PointerEvent | MouseEvent} event
 * @returns {{ lineNumber: number, character: number } | null}
 */
export function positionFromEditorPointer(shadowRoot, event) {
  const lineEl = findLineElement(shadowRoot, event);
  if (lineEl == null) return null;

  const lineNumber = parseInt(lineEl.dataset.line ?? '', 10);
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return null;

  return {
    lineNumber,
    character: characterFromClientX(lineEl, event.clientX),
  };
}

/**
 * @param {ShadowRoot} shadowRoot
 * @param {PointerEvent | MouseEvent} event
 * @returns {HTMLElement | null}
 */
function findLineElement(shadowRoot, event) {
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.dataset.line == null) continue;
    if (node.dataset.lineType === 'change-deletion') continue;
    return node;
  }

  const hit = shadowRoot.elementFromPoint?.(event.clientX, event.clientY);
  if (!(hit instanceof Element)) return null;
  const line = hit.closest?.('[data-line]');
  if (!(line instanceof HTMLElement)) return null;
  if (line.dataset.lineType === 'change-deletion') return null;
  return line;
}

/**
 * @param {HTMLElement} lineEl
 * @param {number} clientX
 */
function characterFromClientX(lineEl, clientX) {
  const tokens = lineEl.querySelectorAll('[data-char]');
  if (tokens.length === 0) {
    const text = lineEl.textContent ?? '';
    if (!text) return 0;
    const rect = lineEl.getBoundingClientRect();
    if (clientX <= rect.left) return 0;
    if (clientX >= rect.right) return text.length;
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
    return Math.round(ratio * text.length);
  }

  for (const token of tokens) {
    if (!(token instanceof HTMLElement)) continue;
    const rect = token.getBoundingClientRect();
    const base = parseInt(token.dataset.char ?? '0', 10) || 0;
    const len = token.textContent?.length ?? 0;
    if (clientX < rect.left) return base;
    if (clientX <= rect.right) {
      if (len === 0 || rect.width <= 0) return base;
      const ratio = (clientX - rect.left) / rect.width;
      return base + Math.min(len, Math.max(0, Math.round(ratio * len)));
    }
  }

  const last = tokens[tokens.length - 1];
  if (!(last instanceof HTMLElement)) return 0;
  const base = parseInt(last.dataset.char ?? '0', 10) || 0;
  return base + (last.textContent?.length ?? 0);
}

/**
 * Wire click → imperative caret for WKWebView. Returns a dispose function.
 *
 * @param {import('@pierre/diffs/edit').Editor} editor
 * @param {{ fileContainer?: HTMLElement | null }} fileInstance
 * @param {() => boolean} isCurrent
 */
export function bindEditorClickCaret(editor, fileInstance, isCurrent) {
  const host = fileInstance?.fileContainer;
  if (!(host instanceof HTMLElement)) return () => {};

  const placeCaret = (event) => {
    if (event.button !== 0 || !isCurrent()) return;
    const shadow = host.shadowRoot;
    if (shadow == null) return;
    const pos = positionFromEditorPointer(shadow, event);
    if (pos == null) return;
    // After Pierre's selectionchange attempt (often a no-op in WKWebView).
    queueMicrotask(() => {
      if (!isCurrent()) return;
      editor.focus({
        lineNumber: pos.lineNumber,
        character: pos.character,
        preventScroll: true,
      });
    });
  };

  host.addEventListener('pointerdown', placeCaret);
  return () => host.removeEventListener('pointerdown', placeCaret);
}
