import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceIndexModel } from './workspaceIndex.js';

const getWorkspaceIndex = vi.fn();
const refreshWorkspaceIndex = vi.fn();
const openWorkspace = vi.fn();

const api = {
  getWorkspaceIndex: (...a) => getWorkspaceIndex(...a),
  refreshWorkspaceIndex: (...a) => refreshWorkspaceIndex(...a),
  openWorkspace: (...a) => openWorkspace(...a),
};

describe('WorkspaceIndexModel', () => {
  let model;
  let onError;

  beforeEach(() => {
    getWorkspaceIndex.mockReset();
    refreshWorkspaceIndex.mockReset().mockResolvedValue(undefined);
    openWorkspace.mockReset();
    onError = vi.fn();
    model = new WorkspaceIndexModel({ api, onError });
  });

  afterEach(() => {
    model[Symbol.dispose]?.();
  });

  it('applyIndex mirrors the event payload and tolerates null', () => {
    model.applyIndex([{ id: 'repo:/a' }]);
    expect(model.entries.value).toHaveLength(1);
    model.applyIndex(null);
    expect(model.entries.value).toEqual([]);
  });

  it('refresh loads cached entries and kicks a background refresh', async () => {
    getWorkspaceIndex.mockResolvedValue([{ id: 'wt:/a' }]);
    await model.refresh();
    expect(model.entries.value).toEqual([{ id: 'wt:/a' }]);
    expect(refreshWorkspaceIndex).toHaveBeenCalledTimes(1);
    expect(model.loading.value).toBe(false);
  });

  it('refresh reports errors', async () => {
    getWorkspaceIndex.mockRejectedValue(new Error('boom'));
    await model.refresh();
    expect(onError).toHaveBeenCalledWith('Workspace Error', 'boom');
    expect(model.loading.value).toBe(false);
  });

  it('open resolves true and clears opening', async () => {
    openWorkspace.mockResolvedValue(undefined);
    const p = model.open('pr:/a#1');
    expect(model.opening.value).toBe('pr:/a#1');
    await expect(p).resolves.toBe(true);
    expect(model.opening.value).toBe('');
    expect(openWorkspace).toHaveBeenCalledWith('pr:/a#1');
  });

  it('open reports failure and resolves false', async () => {
    openWorkspace.mockRejectedValue(new Error('nope'));
    await expect(model.open('x')).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith('Open Workspace Error', 'nope');
    expect(model.opening.value).toBe('');
  });

  it('open ignores empty ids and concurrent opens', async () => {
    let resolve;
    openWorkspace.mockReturnValue(new Promise((r) => { resolve = r; }));
    await expect(model.open('')).resolves.toBe(false);
    const first = model.open('a');
    await expect(model.open('b')).resolves.toBe(false);
    resolve();
    await first;
    expect(openWorkspace).toHaveBeenCalledTimes(1);
  });
});
