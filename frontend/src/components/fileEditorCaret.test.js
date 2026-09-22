/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { positionFromEditorPointer } from './fileEditorCaret.js';

function makeLine(lineNumber, tokens) {
  const line = document.createElement('div');
  line.dataset.line = String(lineNumber);
  line.dataset.lineType = 'context';
  for (const [char, text, left, width] of tokens) {
    const span = document.createElement('span');
    span.dataset.char = String(char);
    span.textContent = text;
    span.getBoundingClientRect = () => ({
      left,
      right: left + width,
      top: 0,
      bottom: 20,
      width,
      height: 20,
      x: left,
      y: 0,
      toJSON() {},
    });
    line.appendChild(span);
  }
  return line;
}

describe('positionFromEditorPointer', () => {
  it('maps a click on a token to line + character', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.dataset.content = '';
    const line = makeLine(3, [
      [0, 'abc', 10, 30],
      [3, 'def', 40, 30],
    ]);
    content.appendChild(line);
    shadow.appendChild(content);

    const event = {
      clientX: 55,
      clientY: 10,
      composedPath: () => [line.children[1], line, content, shadow, host],
    };

    expect(positionFromEditorPointer(shadow, event)).toEqual({
      lineNumber: 3,
      character: 5,
    });
  });

  it('returns null when the click is not on a line', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(document.createElement('div'));
    const event = {
      clientX: 0,
      clientY: 0,
      composedPath: () => [shadow, host],
    };
    expect(positionFromEditorPointer(shadow, event)).toBeNull();
  });
});
