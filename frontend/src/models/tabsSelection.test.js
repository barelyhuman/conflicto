import { describe, expect, it, vi } from 'vitest';
import { TabsModel } from './tabs.js';
import { SelectionModel } from './selection.js';
import { WorkingTreeModel } from './workingTree.js';
import { bindTabsToSelection, highlightedPath } from './tabsSelection.js';

describe('bindTabsToSelection', () => {
  function setup() {
    const tabs = new TabsModel();
    tabs.setScope('/wt');
    const api = { getDiff: vi.fn() };
    const selection = new SelectionModel({
      workingTree: new WorkingTreeModel({ api: {} }),
      api,
    });
    const dispose = bindTabsToSelection({ tabs, selection });

    return { tabs, selection, api, dispose };
  }

  it('selects the active diff tab and fetches its diff', () => {
    const { tabs, selection, api, dispose } = setup();
    tabs.open({ kind: 'diff', path: 'a.go', mode: 'staged' });
    expect(selection.activeFile.value).toBe('a.go');
    expect(selection.activeSection.value).toBe('staged');
    expect(api.getDiff).toHaveBeenCalledWith('a.go', true);
    dispose();
  });

  it('follows tab switches and ignores file tabs', () => {
    const { tabs, selection, dispose } = setup();
    tabs.open({ kind: 'diff', path: 'a.go' });
    tabs.open({ kind: 'diff', path: 'b.go' });
    expect(selection.activeFile.value).toBe('b.go');
    tabs.open({ kind: 'file', path: 'c.go' });
    expect(selection.activeFile.value).toBe('b.go');
    tabs.activate('diff:a.go');
    expect(selection.activeFile.value).toBe('a.go');
    expect(selection.activeSection.value).toBe('unstaged');
    dispose();
  });

  it('clears selection when the last tab closes', () => {
    const { tabs, selection, dispose } = setup();
    tabs.open({ kind: 'diff', path: 'a.go' });
    tabs.close('diff:a.go');
    expect(selection.activeFile.value).toBeNull();
    dispose();
  });
});

describe('highlightedPath', () => {
  it('limits diff tabs to their own section and spans sections for file tabs', () => {
    const diff = { kind: 'diff', path: 'a.go', mode: 'working' };
    expect(highlightedPath(diff, 'unstaged')).toBe('a.go');
    expect(highlightedPath(diff, 'staged')).toBeNull();
    expect(highlightedPath({ kind: 'file', path: 'a.go' }, 'staged')).toBe('a.go');
    expect(highlightedPath(null, 'staged')).toBeNull();
  });
});
