/**
 * @vitest-environment happy-dom
 *
 * Debug: reproduce "no cursor / cannot edit" in edit mode.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact/compat';
import { EditProvider } from './EditProvider.jsx';
import { File } from '@pierre/diffs/react';
import { registerCustomTheme } from '@pierre/diffs';
import { createAppShikiTheme } from '../theme/adapter.js';

function registerThemes() {
  registerCustomTheme('conflicto-dark', () => Promise.resolve(createAppShikiTheme('dark')));
  registerCustomTheme('conflicto-light', () => Promise.resolve(createAppShikiTheme('light')));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('FileEditor editor attach', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('attaches editor and makes content editable', async () => {
    registerThemes();
    const file = {
      name: 'src/test.js',
      contents: 'const a = 1;\nconst b = 2;\n',
      cacheKey: 'src/test.js',
    };

    let attachedEditor = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(
      <EditProvider>
        <File
          file={file}
          edit={true}
          editorOptions={{
            persistState: true,
            onAttach: (editor) => {
              attachedEditor = editor;
            },
          }}
          options={{
            theme: { dark: 'conflicto-dark', light: 'conflicto-light' },
            themeType: 'dark',
            disableFileHeader: true,
            overflow: 'wrap',
            disableWorkerPool: true,
          }}
        />
      </EditProvider>,
      container
    );

    for (let i = 0; i < 50; i++) {
      await wait(100);
      if (attachedEditor != null) break;
    }
    expect(attachedEditor).not.toBeNull();

    const host = container.querySelector('diffs-container');
    expect(host).not.toBeNull();

    const shadow = host.shadowRoot;
    expect(shadow).not.toBeNull();
    const content = shadow.querySelector('[data-content]');
    expect(content).not.toBeNull();
    expect(content.getAttribute('contenteditable')).toBe('true');
  });
});