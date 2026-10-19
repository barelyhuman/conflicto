import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabsModel } from './tabs.js';
import { WorkingTreeModel } from './workingTree.js';
import { createPRTabRegistry } from './prTab.js';
import { createNavigator, openDiff, openFileAt, openPR, registerNavigator } from './navigation.js';

describe('navigation', () => {
  let tabs;
  let workingTree;
  let prTabs;
  let api;
  let onError;
  let reveal;
  let nav;

  const active = () => tabs.activeTab.value;

  beforeEach(() => {
    tabs = new TabsModel();
    tabs.setScope('/wt');
    prTabs = createPRTabRegistry({
      api: {
        getPRDetails: async () => ({ title: 't', worktreePath: '' }),
        getPRFilesList: async () => [],
        getPRReviewComments: async () => [],
        getPRTimeline: async () => [],
        getReviewState: async () => ({}),
      },
    });
    api = { openPRLocally: vi.fn(async () => '/wt-pr') };
    onError = vi.fn();
    reveal = vi.fn();
    workingTree = new WorkingTreeModel({ api: {} });
    workingTree.applyStatus({
      staged: [{ path: 'staged.go' }, { path: 'both.go' }],
      unstaged: [{ path: 'dirty.go' }, { path: 'both.go' }],
      conflicts: [{ path: 'conflict.go' }],
    });
    nav = createNavigator({
      tabs,
      workingTree,
      prTabs,
      api,
      onError,
      reveal,
    });
  });

  afterEach(() => {
    registerNavigator(null);
  });

  it('opens a clean file as a file tab revealed at line:col', () => {
    expect(nav.openFileAt('clean.go', 12, 5)).toBe(true);
    expect(active()).toMatchObject({ kind: 'file', path: 'clean.go', preview: false });
    expect(reveal).toHaveBeenCalledWith('file:clean.go', 12, 5, '/wt');
  });

  it('opens a clean file with no line without revealing', () => {
    nav.openFileAt('clean.go');
    expect(active().kind).toBe('file');
    expect(reveal).not.toHaveBeenCalled();
  });

  it('defaults column to 1', () => {
    nav.openFileAt('clean.go', 3);
    expect(reveal).toHaveBeenCalledWith('file:clean.go', 3, 1, '/wt');
  });

  it('shows the working diff for a changed file when no line is given', () => {
    nav.openFileAt('dirty.go');
    expect(active()).toMatchObject({ kind: 'diff', path: 'dirty.go', mode: 'working' });
  });

  it('opens a file tab for a changed file when a line is given', () => {
    nav.openFileAt('dirty.go', 30, 4);
    expect(active()).toMatchObject({ kind: 'file', path: 'dirty.go' });
    expect(reveal).toHaveBeenCalledWith('file:dirty.go', 30, 4, '/wt');
  });

  it('shows the staged diff for staged-only files', () => {
    nav.openFileAt('staged.go');
    expect(active()).toMatchObject({ kind: 'diff', mode: 'staged' });
  });

  it('prefers the working diff when a file is both staged and unstaged', () => {
    nav.openFileAt('both.go');
    expect(active()).toMatchObject({ kind: 'diff', mode: 'working' });
  });

  it('shows the conflict view for conflicted files', () => {
    nav.openFileAt('conflict.go');
    expect(active()).toMatchObject({ kind: 'diff', mode: 'conflict' });
  });

  it('focuses an existing tab instead of duplicating', () => {
    nav.openFileAt('clean.go', 1);
    nav.openFileAt('clean.go', 9);
    expect(tabs.tabs.value).toHaveLength(1);
    expect(reveal).toHaveBeenLastCalledWith('file:clean.go', 9, 1, '/wt');
  });

  it('openPR opens or focuses a pr tab in the current scope', async () => {
    expect(await nav.openPR(12)).toBe(true);
    expect(active()).toMatchObject({ id: 'pr:12', kind: 'pr', number: 12 });
    nav.openFileAt('clean.go', 1);
    await nav.openPR(12);
    expect(tabs.tabs.value.map((t) => t.id)).toEqual(['pr:12', 'file:clean.go']);
    expect(active().id).toBe('pr:12');
    expect(api.openPRLocally).not.toHaveBeenCalled();
    expect(await nav.openPR(0)).toBe(false);
  });

  it('openPR locally moves the tab and its model into the worktree scope', async () => {
    const model = prTabs.get('/wt', 12);
    await nav.openPR(12);
    nav.openFileAt('clean.go', 1);
    expect(await nav.openPR(12, { locally: true })).toBe(true);
    expect(api.openPRLocally).toHaveBeenCalledWith(12);
    expect(tabs.currentScope()).toBe('/wt-pr');
    expect(tabs.tabs.value.map((t) => t.id)).toEqual(['pr:12']);
    expect(active().id).toBe('pr:12');
    expect(prTabs.peek('/wt-pr', 12)).toBe(model);
    expect(prTabs.peek('/wt', 12)).toBeNull();
    tabs.setScope('/wt');
    expect(tabs.tabs.value.map((t) => t.id)).toEqual(['file:clean.go']);
  });

  it('openPR locally leaves the tab in place and reports when the backend fails', async () => {
    api.openPRLocally.mockRejectedValue(new Error('gh missing'));
    expect(await nav.openPR(3, { locally: true })).toBe(false);
    expect(onError).toHaveBeenCalledWith('Open locally failed', 'gh missing');
    expect(tabs.currentScope()).toBe('/wt');
    expect(active().id).toBe('pr:3');
  });

  it('openDiff opens a preview diff tab', () => {
    nav.openDiff('dirty.go', 'staged');
    expect(active()).toMatchObject({ kind: 'diff', mode: 'staged', preview: true });
  });

  it('module-level helpers delegate to the registered navigator', async () => {
    expect(openFileAt('a.go', 1)).toBe(false);
    expect(openDiff('a.go')).toBe(false);
    const impl = {
      openFileAt: vi.fn(() => true),
      openDiff: vi.fn(() => true),
      openPR: vi.fn(async () => true),
    };
    const off = registerNavigator(impl);
    expect(openFileAt('a.go', 5, 2)).toBe(true);
    expect(impl.openFileAt).toHaveBeenCalledWith('a.go', 5, 2);
    expect(openDiff('a.go', 'staged')).toBe(true);
    expect(await openPR(4, { locally: true })).toBe(true);
    expect(impl.openPR).toHaveBeenCalledWith(4, { locally: true });
    off();
    expect(openFileAt('a.go', 1)).toBe(false);
    expect(await openPR(4)).toBe(false);
  });
});
