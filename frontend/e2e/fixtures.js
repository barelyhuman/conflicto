import { test as base, expect } from '@playwright/test';
import { createRepo } from './helpers/repo.js';

export const test = base.extend({
  repo: async ({}, use) => {
    const repo = createRepo();
    await use(repo);
    repo.cleanup();
  },
  /** Page with the fixture repo opened through the real Go backend. */
  app: async ({ page, repo }, use) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.go?.main?.App);
    await page.evaluate(async (path) => {
      await window.go.main.App.SwitchProject(path);
      await window.go.main.App.Refresh();
    }, repo.dir);
    await use(page);
  },
});

export { expect };
