/**
 * @vitest-environment happy-dom
 *
 * Debug: reproduce "no cursor / cannot edit" in edit mode.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, h } from 'preact';
import { EditProvider } from './EditProvider.jsx';
import { FileEditor } from './FileEditor.jsx';
import { ThemeProvider } from '../theme/ThemeProvider.jsx';
import { registerCustomTheme } from '@pierre/diffs';
import { createAppShikiTheme } from '../theme/adapter.js';

function registerThemes() {
  registerCustomTheme('conflicto-dark', () => Promise.resolve(createAppShikiTheme('dark')));
  registerCustomTheme('conflicto-light', () => Promise.resolve(createAppShikiTheme('light')));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('FileEditor (real component)', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders an editable, focusable editor with a caret after click', async () => {
    registerThemes();
    window.go = {
      main: {
        App: {
          GetFileContents: async () => ({
            hasNew: true,
            newContent: 'const a = 1;\nconst b = 2;\n',
            hasOld: false,
            oldContent: '',
          }),
        },
      },
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const errors = [];
    render(
      h(ThemeProvider, null,
        h(EditProvider, null, h(FileEditor, { path: 'src/test.js', onError: (t, m) => errors.push([t, m]) }))
      ),
      container
    );

    let host = null;
    for (let i = 0; i < 50; i++) {
      await wait(100);
      host = container.querySelector('diffs-container');
      if (host != null) break;
    }
    expect(host, 'diffs-container rendered').not.toBeNull();

    const shadow = host.shadowRoot;
    const content = shadow.querySelector('[data-content]');
    expect(content, 'content element').not.toBeNull();
    expect(content.getAttribute('contenteditable'), 'contenteditable').toBe('true');

    const overlay = shadow.querySelector('[data-editor-overlay]');
    expect(overlay, 'overlay').not.toBeNull();

    const line = content.querySelector('[data-line]');
    expect(line, 'line element').not.toBeNull();

    line.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        button: 0,
        pointerType: 'mouse',
      })
    );
    content.focus();
    await wait(50);

    const caret = shadow.querySelector('[data-caret]');
    expect(caret, 'caret element rendered after click/focus').not.toBeNull();
    expect(errors, 'no save/load errors').toEqual([]);
  });
});