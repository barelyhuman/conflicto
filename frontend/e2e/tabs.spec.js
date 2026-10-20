import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './fixtures.js';

test('opening changed files creates diff tabs and closing removes them', async ({ app, repo }) => {
  repo.write('one.txt', 'one\n');
  repo.write('two.txt', 'two\n');
  await app.evaluate(() => window.go.main.App.Refresh());

  const tabs = app.locator('.editor-tab');
  await app.locator('.change-tree-file-main', { hasText: 'one.txt' }).click();
  await expect(tabs).toHaveCount(1);

  // Double click pins the preview, so the next file opens a second tab.
  await app.locator('.change-tree-file-main', { hasText: 'one.txt' }).dblclick();
  await expect(tabs.first()).not.toHaveClass(/preview/);
  await app.locator('.change-tree-file-main', { hasText: 'two.txt' }).click();
  await expect(tabs).toHaveCount(2);

  await tabs.nth(1).locator('.editor-tab-close').click();
  await expect(tabs).toHaveCount(1);
});

test('file tab edits save to disk with Cmd/Ctrl+S', async ({ app, repo }) => {
  repo.write('note.txt', 'hello\n');
  await app.evaluate(() => window.go.main.App.Refresh());
  await app.locator('.change-tree-file-main', { hasText: 'note.txt' }).hover();
  await app.getByLabel('Open file to edit').first().click();

  const content = app.locator('.cm-content');
  await expect(content).toBeVisible();
  await content.click();
  await app.keyboard.press('ControlOrMeta+ArrowUp');
  await app.keyboard.press('End');
  await app.keyboard.type('world');
  await expect(app.locator('.editor-tab.dirty')).toHaveCount(1);

  await app.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => readFileSync(join(repo.dir, 'note.txt'), 'utf8')).toBe('helloworld\n');
  await expect(app.locator('.editor-tab.dirty')).toHaveCount(0);
});
