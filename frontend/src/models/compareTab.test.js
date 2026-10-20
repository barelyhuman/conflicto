import { describe, expect, it, vi } from 'vitest';
import { CompareTabModel, createCompareTabRegistry } from './compareTab.js';
import { TabsModel } from './tabs.js';

function fakeApi(overrides = {}) {
  return {
    getCompareFiles: vi.fn(async () => ({
      baseSHA: 'base1',
      files: [
        { path: 'a.go', status: 'M', additions: 2, deletions: 1 },
        { path: 'new.go', oldPath: 'old.go', status: 'R', additions: 1, deletions: 0 },
        { path: 'scratch.txt', status: 'A', additions: 0, deletions: 0, untracked: true },
      ],
    })),
    getCompareFilePatch: vi.fn(async (base, path) => ({ patch: `${base}:${path}` })),
    getCompareFileContents: vi.fn(async () => ({ hasOld: true, hasNew: true, oldContent: 'o', newContent: 'n' })),
    ...overrides,
  };
}

describe('CompareTabModel', () => {
  it('loads files, totals and the first patch against the resolved base', async () => {
    const api = fakeApi();
    const model = new CompareTabModel({ ref: 'main', mergeBase: true, api });

    await model.load();
    expect(api.getCompareFiles).toHaveBeenCalledWith('main', true);
    expect(model.baseSHA.value).toBe('base1');
    expect(model.totals.value).toEqual({ additions: 3, deletions: 1 });
    expect(model.selectedPath.value).toBe('a.go');
    expect(model.activeDiff.value.patch).toBe('base1:a.go');
  });

  it('passes the old path for renames and the untracked flag', async () => {
    const api = fakeApi();
    const model = new CompareTabModel({ ref: 'main', api });

    await model.load();
    await model.selectFile('new.go');
    expect(api.getCompareFilePatch).toHaveBeenLastCalledWith('base1', 'new.go', 'old.go', false);
    await model.selectFile('scratch.txt');
    expect(api.getCompareFilePatch).toHaveBeenLastCalledWith('base1', 'scratch.txt', '', true);
    await model.loadContents('new.go');
    expect(api.getCompareFileContents).toHaveBeenCalledWith('base1', 'new.go', 'old.go');
  });

  it('a silent refresh keeps the selection and refetches its patch', async () => {
    const api = fakeApi();
    const model = new CompareTabModel({ ref: 'main', api });

    await model.load();
    await model.selectFile('new.go');
    api.getCompareFilePatch.mockImplementation(async (base, path) => ({ patch: `v2:${path}` }));
    await model.refresh({ silent: true });
    expect(model.selectedPath.value).toBe('new.go');
    expect(model.activeDiff.value.patch).toBe('v2:new.go');
  });

  it('shows a load error, but a failed silent refresh keeps the data', async () => {
    const bad = new CompareTabModel({
      ref: 'nope',
      api: fakeApi({ getCompareFiles: vi.fn(async () => { throw new Error('unknown ref "nope"'); }) }),
    });

    await bad.load();
    expect(bad.error.value).toBe('unknown ref "nope"');

    const api = fakeApi();
    const model = new CompareTabModel({ ref: 'main', api });

    await model.load();
    api.getCompareFiles.mockRejectedValueOnce(new Error('boom'));
    await model.refresh({ silent: true });
    expect(model.error.value).toBeNull();
    expect(model.files.value).toHaveLength(3);
  });

  it('steps through files with wrap-around', async () => {
    const model = new CompareTabModel({ ref: 'main', api: fakeApi() });

    await model.load();
    model.stepFile(-1);
    expect(model.selectedPath.value).toBe('scratch.txt');
    model.stepFile(1);
    expect(model.selectedPath.value).toBe('a.go');
  });
});

describe('compare tabs', () => {
  it('opens one tab per ref and mode, titled like git diff', () => {
    const tabs = new TabsModel();
    tabs.setScope('/repo');

    const direct = tabs.open({ kind: 'compare', ref: ' main ' });
    const mb = tabs.open({ kind: 'compare', ref: 'main', mergeBase: true });

    expect(direct).toMatchObject({ id: 'compare:main', ref: 'main', mergeBase: false, title: 'vs main', preview: false });
    expect(mb).toMatchObject({ id: 'compare:main...', mergeBase: true, title: 'vs main...' });
    expect(tabs.open({ kind: 'compare', ref: 'main' }).id).toBe('compare:main');
    expect(tabs.tabs.value).toHaveLength(2);
    expect(tabs.open({ kind: 'compare', ref: '  ' })).toBeNull();
  });

  it('reopens a closed compare tab with its mode', () => {
    const tabs = new TabsModel();
    tabs.setScope('/repo');
    const tab = tabs.open({ kind: 'compare', ref: 'v1.0', mergeBase: true });

    tabs.close(tab.id);
    expect(tabs.reopenClosed()).toMatchObject({ id: 'compare:v1.0...', ref: 'v1.0', mergeBase: true });
  });

  it('releases the model when the tab is closed', () => {
    const tabs = new TabsModel();
    tabs.setScope('/repo');
    const registry = createCompareTabRegistry({ api: fakeApi() });
    const unbind = registry.bindTabs(tabs);
    const tab = tabs.open({ kind: 'compare', ref: 'main' });
    const model = registry.get('/repo', 'main', false);

    expect(registry.get('/repo', 'main', false)).toBe(model);
    expect(registry.peek('/repo', tab.path)).toBe(model);
    tabs.close(tab.id);
    expect(registry.peek('/repo', tab.path)).toBeNull();
    unbind();
  });
});
