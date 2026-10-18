import { test, expect } from './fixtures.js';

test('shows changed files from the real repo', async ({ app, repo }) => {
  repo.write('hello.txt', 'hi\n');
  await app.evaluate(() => window.go.main.App.Refresh());
  await expect(app.getByText('hello.txt').first()).toBeVisible();
});
