import { test, expect } from './fixtures.js';

test('stage all and commit lands in git history', async ({ app, repo }) => {
  repo.write('hello.txt', 'hi\n');
  await app.evaluate(() => window.go.main.App.Refresh());
  await expect(app.getByText('hello.txt').first()).toBeVisible();

  await app.getByTitle('Stage All').click();
  await expect.poll(() => repo.git('diff', '--cached', '--name-only')).toBe('hello.txt');

  await app.locator('.commit-message-input').fill('add hello');
  await app.locator('.commit-button').click();
  await expect.poll(() => repo.git('log', '-1', '--format=%s')).toBe('add hello');
});
