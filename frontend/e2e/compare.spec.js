import { test, expect } from './fixtures.js';

test('palette diffs the working tree against a ref and its merge base', async ({ app, repo }) => {
  // feature: one commit + an uncommitted edit; main: a commit feature does not have.
  repo.git('checkout', '-b', 'feature');
  repo.write('feature.txt', 'feature\n');
  repo.git('add', '.');
  repo.git('commit', '-m', 'feature');
  repo.git('checkout', 'main');
  repo.write('main-only.txt', 'main\n');
  repo.git('add', '.');
  repo.git('commit', '-m', 'main only');
  repo.git('checkout', 'feature');
  repo.write('README.md', '# fixture\nedited\n');
  await app.evaluate(() => window.go.main.App.Refresh());

  await app.keyboard.press('ControlOrMeta+k');
  const input = app.locator('.palette-input');
  await input.fill('diff');
  await app.locator('.palette-row', { hasText: 'Diff against ref' }).click();
  await expect(app.locator('.palette-chip')).toContainText('Diff');

  await input.fill('main');
  await expect(app.locator('.palette-row').first()).toContainText('main');
  await input.press('Enter');

  const tab = app.locator('.editor-tab', { hasText: 'vs main' });
  await expect(tab).toHaveCount(1);
  const files = app.locator('.pr-files-list');
  // Direct compare: main's own commit shows up as a deletion.
  await expect(files).toContainText('feature.txt');
  await expect(files).toContainText('README.md');
  await expect(files).toContainText('main-only.txt');

  await app.getByRole('button', { name: 'From merge base' }).click();
  await expect(app.locator('.editor-tab', { hasText: 'vs main...' })).toHaveCount(1);
  // The toggle replaces the tab rather than adding one.
  await expect(app.locator('.editor-tab', { hasText: 'vs main' })).toHaveCount(1);
  await expect(files).toContainText('feature.txt');
  await expect(files).toContainText('README.md');
  await expect(files).not.toContainText('main-only.txt');
});

test('palette accepts a revision expression as the ref', async ({ app, repo }) => {
  repo.write('second.txt', 'two\n');
  repo.git('add', '.');
  repo.git('commit', '-m', 'second');

  await app.keyboard.press('ControlOrMeta+k');
  const input = app.locator('.palette-input');
  await input.fill('diff');
  await app.locator('.palette-row', { hasText: 'Diff against ref' }).click();
  await input.fill('HEAD~1');
  await expect(app.locator('.palette-row').first()).toContainText('HEAD~1');
  await input.press('Enter');

  await expect(app.locator('.editor-tab', { hasText: 'vs HEAD~1' })).toHaveCount(1);
  await expect(app.locator('.pr-files-list')).toContainText('second.txt');
});
