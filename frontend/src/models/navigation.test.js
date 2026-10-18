import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { TabsModel } from './tabs.js';
import { WorkingTreeModel } from './workingTree.js';
import { createNavigator, openDiff, openFileAt, registerNavigator } from './navigation.js';

describe('navigation', () => {
  let tabs;
  let workingTree;
  let activePR;
  let prFiles;
  let reveal;
  let nav;

  const active = () => tabs.activeTab.value;

  beforeEach(() => {
    tabs = new TabsModel();
    tabs.setScope('/wt');
    activePR = signal(null);
    prFiles = [];
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
      activePR,
      isPRFile: (p) => prFiles.includes(p),
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

  it('PR mode opens PR files as pr diffs and others as file tabs', () => {
    activePR.value = 7;
    prFiles = ['pr.go'];
    nav.openFileAt('pr.go', 10);
    expect(active()).toMatchObject({ kind: 'diff', mode: 'pr', path: 'pr.go' });
    nav.openFileAt('other.go', 2);
    expect(active()).toMatchObject({ kind: 'file', path: 'other.go' });
  });

  it('openDiff opens a preview diff tab', () => {
    nav.openDiff('dirty.go', 'staged');
    expect(active()).toMatchObject({ kind: 'diff', mode: 'staged', preview: true });
  });

  it('module-level helpers delegate to the registered navigator', () => {
    expect(openFileAt('a.go', 1)).toBe(false);
    expect(openDiff('a.go')).toBe(false);
    const impl = { openFileAt: vi.fn(() => true), openDiff: vi.fn(() => true) };
    const off = registerNavigator(impl);
    expect(openFileAt('a.go', 5, 2)).toBe(true);
    expect(impl.openFileAt).toHaveBeenCalledWith('a.go', 5, 2);
    expect(openDiff('a.go', 'staged')).toBe(true);
    off();
    expect(openFileAt('a.go', 1)).toBe(false);
  });
});
