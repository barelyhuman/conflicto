import { test, expect } from './fixtures.js';

/** Viewport centre of the first occurrence of `word` in the editor. */
async function wordPoint(page, word) {
  return page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.cm-content'), NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const i = node.data.indexOf(w);

      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + w.length);
        const b = r.getBoundingClientRect();

        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }

    return null;
  }, word);
}

test('gopls: status pill, hover and goto-definition on a Go file', async ({ app, repo }) => {
  test.setTimeout(120_000);
  repo.write('go.mod', 'module example.com/fix\n\ngo 1.21\n');
  repo.write('main.go', 'package main\n\nvar msg = greet("x")\n\nfunc main() { println(msg) }\n');
  repo.write(
    'util.go',
    'package main\n\n// greet says hello.\nfunc greet(name string) string {\n\treturn "hi " + name\n}\n'
  );
  repo.git('add', '.');
  repo.git('commit', '-m', 'go fixture');
  await app.evaluate(() => window.go.main.App.Refresh());

  // Open main.go through global search -> result.
  await app.keyboard.press('ControlOrMeta+Shift+F');
  await app.locator('.search-panel .search-input').first().fill('var msg');
  await app.locator('.result-row', { hasText: 'var msg' }).click();
  await expect(app.locator('.editor-tab', { hasText: 'main.go' })).toHaveCount(1);

  // Honest status: starts, then becomes ready.
  const pill = app.locator('.lsp-pill-text');
  await expect(pill).toContainText('gopls', { timeout: 30_000 });
  await expect(pill).toHaveText('gopls · ready', { timeout: 90_000 });

  // Hover shows the signature.
  const p = await wordPoint(app, 'greet');
  await app.mouse.move(p.x, p.y);
  await expect(app.locator('.cm-lsp-hover')).toContainText('func greet(name string) string', {
    timeout: 15_000,
  });

  // Cmd/Ctrl-click jumps to the definition in util.go.
  await app.mouse.move(0, 0);
  await app.keyboard.down('ControlOrMeta');
  await app.mouse.click(p.x, p.y);
  await app.keyboard.up('ControlOrMeta');
  await expect(app.locator('.editor-tab', { hasText: 'util.go' })).toHaveCount(1);
  await expect(app.locator('.cm-activeLine')).toContainText('func greet');

  // Shift+F12 lists references (declaration + the call in main.go).
  await app.keyboard.press('Shift+F12');
  const panel = app.locator('.refs-panel');
  await expect(panel).toContainText('References to greet');
  await expect(panel.locator('.result-row')).toHaveCount(2);
  await panel.locator('.refs-close').click();

  // Back (Ctrl+- on macOS, Alt+Left elsewhere) returns to the call site.
  await app.keyboard.press(process.platform === 'darwin' ? 'Control+Minus' : 'Alt+ArrowLeft');
  await expect(app.locator('.editor-tab.active', { hasText: 'main.go' })).toHaveCount(1);
  await expect(app.locator('.cm-activeLine')).toContainText('var msg');
});
