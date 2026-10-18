import { test, expect } from './fixtures.js';

test('global search (Cmd/Ctrl+Shift+F) lists matches and opens a file tab at the line', async ({
  app,
  repo,
}) => {
  repo.write('notes.txt', 'alpha\nneedle in a haystack\nomega\n');
  repo.write('other.txt', 'nothing here\n');
  repo.git('add', '.');
  repo.git('commit', '-m', 'add files');
  await app.evaluate(() => window.go.main.App.Refresh());

  await app.keyboard.press('ControlOrMeta+Shift+F');
  const input = app.locator('.search-panel .search-input').first();
  await expect(input).toBeFocused();
  await input.fill('needle');

  const row = app.locator('.result-row', { hasText: 'needle in a haystack' });
  await expect(row).toBeVisible();
  await expect(app.locator('.search-summary').first()).toContainText('1 result in 1 file');
  await expect(row.locator('mark')).toHaveText('needle');

  // Keyboard: ArrowDown from the input to the first result, Enter opens it.
  await input.press('ArrowDown');
  await app.keyboard.press('Enter');

  await expect(app.locator('.editor-tab', { hasText: 'notes.txt' })).toHaveCount(1);
  await expect(app.locator('.cm-content')).toContainText('needle in a haystack');
  await expect(app.locator('.cm-activeLine')).toContainText('needle in a haystack');
});
