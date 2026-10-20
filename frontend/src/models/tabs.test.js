import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabsModel, modeForSection, sectionForMode } from './tabs.js';

describe('TabsModel', () => {
  let t;

  const ids = () => t.tabs.value.map((x) => x.id);

  beforeEach(() => {
    t = new TabsModel();
    t.setScope('/wt/a');
  });

  it('dedupes by kind + path and focuses the existing tab', () => {
    t.open({ kind: 'diff', path: 'a.go' });
    t.open({ kind: 'file', path: 'a.go' });
    t.open({ kind: 'diff', path: 'b.go' });
    t.open({ kind: 'diff', path: 'a.go' });
    expect(ids()).toEqual(['diff:a.go', 'file:a.go', 'diff:b.go']);
    expect(t.activeId.value).toBe('diff:a.go');
  });

  it('updates the mode when re-opening a diff in another mode', () => {
    t.open({ kind: 'diff', path: 'a.go', mode: 'working' });
    t.open({ kind: 'diff', path: 'a.go', mode: 'staged' });
    expect(t.tabs.value[0].mode).toBe('staged');
    expect(t.tabs.value).toHaveLength(1);
  });

  it('replaces the preview tab in place and keeps pinned tabs', () => {
    t.open({ kind: 'diff', path: 'pinned.go' });
    t.open({ kind: 'diff', path: 'p1.go', preview: true });
    t.open({ kind: 'diff', path: 'other.go' });
    t.open({ kind: 'diff', path: 'p2.go', preview: true });
    expect(ids()).toEqual(['diff:pinned.go', 'diff:p2.go', 'diff:other.go']);
    expect(t.activeId.value).toBe('diff:p2.go');
  });

  it('pins a preview on explicit open, pin(), and dirty', () => {
    t.open({ kind: 'diff', path: 'a.go', preview: true });
    t.open({ kind: 'diff', path: 'a.go' });
    expect(t.tabs.value[0].preview).toBe(false);

    t.open({ kind: 'diff', path: 'b.go', preview: true });
    t.pin('diff:b.go');
    expect(t.tabs.value[1].preview).toBe(false);

    t.open({ kind: 'file', path: 'c.go', preview: true });
    t.setDirty('file:c.go', true);
    expect(t.tabs.value[2].preview).toBe(false);
    t.open({ kind: 'diff', path: 'd.go', preview: true });
    expect(ids()).toContain('file:c.go');
  });

  it('re-opening an existing preview as preview keeps it a preview', () => {
    t.open({ kind: 'diff', path: 'a.go', preview: true });
    t.open({ kind: 'diff', path: 'a.go', preview: true });
    expect(t.tabs.value[0].preview).toBe(true);
  });

  it('closing the active tab activates the most recently used one', () => {
    t.open({ kind: 'file', path: 'a' });
    t.open({ kind: 'file', path: 'b' });
    t.open({ kind: 'file', path: 'c' });
    t.activate('file:a');
    t.activate('file:c');
    t.close('file:c');
    expect(t.activeId.value).toBe('file:a');
    t.close('file:a');
    expect(t.activeId.value).toBe('file:b');
    t.close('file:b');
    expect(t.activeId.value).toBeNull();
  });

  it('closeOthers keeps the target and any dirty tabs', () => {
    t.open({ kind: 'file', path: 'a' });
    t.open({ kind: 'file', path: 'b' });
    t.open({ kind: 'file', path: 'c' });
    t.setDirty('file:a', true);
    t.closeOthers('file:c');
    expect(ids()).toEqual(['file:a', 'file:c']);
    expect(t.activeId.value).toBe('file:c');
  });

  it('requestClose asks first for dirty tabs', () => {
    t.open({ kind: 'file', path: 'a' });
    t.setDirty('file:a', true);
    t.requestClose('file:a');
    expect(ids()).toEqual(['file:a']);
    expect(t.pendingClose.value).toBe('file:a');
    t.cancelPendingClose();
    expect(ids()).toEqual(['file:a']);
    t.requestClose('file:a');
    t.confirmPendingClose();
    expect(ids()).toEqual([]);
  });

  it('reorders tabs', () => {
    ['a', 'b', 'c'].forEach((p) => t.open({ kind: 'file', path: p }));
    t.reorder('file:c', 0);
    expect(ids()).toEqual(['file:c', 'file:a', 'file:b']);
    t.reorder('file:c', 99);
    expect(ids()).toEqual(['file:a', 'file:b', 'file:c']);
  });

  it('reopens closed tabs, most recent first, pinned', () => {
    t.open({ kind: 'diff', path: 'a.go', mode: 'staged', preview: true });
    t.open({ kind: 'file', path: 'b.go' });
    t.close('file:b.go');
    t.close('diff:a.go');
    t.reopenClosed();
    expect(ids()).toEqual(['diff:a.go']);
    expect(t.tabs.value[0].mode).toBe('staged');
    expect(t.tabs.value[0].preview).toBe(false);
    t.reopenClosed();
    expect(ids()).toEqual(['diff:a.go', 'file:b.go']);
    expect(t.reopenClosed()).toBeNull();
  });

  it('selects by index (last for out of range) and steps', () => {
    ['a', 'b', 'c'].forEach((p) => t.open({ kind: 'file', path: p }));
    t.selectIndex(0);
    expect(t.activeId.value).toBe('file:a');
    t.selectIndex(8);
    expect(t.activeId.value).toBe('file:c');
    t.step(1);
    expect(t.activeId.value).toBe('file:a');
    t.step(-1);
    expect(t.activeId.value).toBe('file:c');
  });

  it('cycles MRU and commits on endCycle', () => {
    ['a', 'b', 'c'].forEach((p) => t.open({ kind: 'file', path: p }));
    // MRU: c b a
    t.cycleMru(1);
    expect(t.activeId.value).toBe('file:b');
    t.cycleMru(1);
    expect(t.activeId.value).toBe('file:a');
    t.endCycle();
    expect(t.mruOrder()).toEqual(['file:a', 'file:c', 'file:b']);
    t.cycleMru(-1);
    expect(t.activeId.value).toBe('file:b');
    t.endCycle();
  });

  it('keeps separate tab sets per scope and restores them', () => {
    t.open({ kind: 'file', path: 'a' });
    t.setScope('/wt/b');
    expect(ids()).toEqual([]);
    t.open({ kind: 'diff', path: 'x' });
    t.setScope('/wt/a');
    expect(ids()).toEqual(['file:a']);
    expect(t.activeId.value).toBe('file:a');
    t.setScope('/wt/b');
    expect(ids()).toEqual(['diff:x']);
  });

  it('adopts tabs opened before the first scope', () => {
    const fresh = new TabsModel();
    fresh.open({ kind: 'file', path: 'early' });
    fresh.setScope('/wt/a');
    expect(fresh.tabs.value.map((x) => x.id)).toEqual(['file:early']);
  });

  it('notifies discard listeners for closes, replaced previews and removed scopes', () => {
    const fn = vi.fn();
    t.onDiscard(fn);
    t.open({ kind: 'diff', path: 'p1', preview: true });
    t.open({ kind: 'diff', path: 'p2', preview: true });
    expect(fn).toHaveBeenCalledWith('/wt/a', expect.objectContaining({ id: 'diff:p1' }));
    t.removeScope('/wt/a');
    expect(fn).toHaveBeenCalledWith('/wt/a', expect.objectContaining({ id: 'diff:p2' }));
    expect(ids()).toEqual([]);
  });

  it('seeds once per scope', () => {
    expect(t.canSeed()).toBe(true);
    t.markSeeded();
    expect(t.canSeed()).toBe(false);
  });

  it('maps sections and modes', () => {
    expect(modeForSection('unstaged')).toBe('working');
    expect(sectionForMode('working')).toBe('unstaged');
  });

  describe('pr tabs', () => {
    it('opens pr:<n>, never as a preview, and focuses on re-open', () => {
      const tab = t.open({ kind: 'pr', number: 7, title: '#7 Fix', preview: true });
      expect(tab).toMatchObject({ id: 'pr:7', kind: 'pr', number: 7, title: '#7 Fix', preview: false });
      t.open({ kind: 'file', path: 'a' });
      t.open({ kind: 'pr', number: 7 });
      expect(ids()).toEqual(['pr:7', 'file:a']);
      expect(t.activeId.value).toBe('pr:7');
      expect(t.open({ kind: 'pr', number: 0 })).toBeNull();
    });

    it('defaults and updates the title', () => {
      t.open({ kind: 'pr', number: 3 });
      expect(t.activeTab.value.title).toBe('#3');
      t.setTitle('pr:3', '#3 Hello');
      expect(t.activeTab.value.title).toBe('#3 Hello');
    });

    it('moveTab keeps the tab object, activates it in the target and does not discard', () => {
      const fn = vi.fn();
      t.onDiscard(fn);
      const tab = t.open({ kind: 'pr', number: 9 });
      t.open({ kind: 'file', path: 'keep' });
      t.moveTab('pr:9', '/wt/a', '/wt/pr9');
      expect(ids()).toEqual(['file:keep']);
      expect(t.activeId.value).toBe('file:keep');
      t.setScope('/wt/pr9');
      expect(t.tabs.value[0]).toBe(tab);
      expect(t.activeId.value).toBe('pr:9');
      expect(fn).not.toHaveBeenCalled();
      expect(t.mruOrder()).toEqual(['pr:9']);
    });

    it('moveTab updates the visible set when moving into the current scope', () => {
      t.open({ kind: 'pr', number: 4 });
      t.setScope('/wt/b');
      t.moveTab('pr:4', '/wt/a', '/wt/b');
      expect(ids()).toEqual(['pr:4']);
      expect(t.activeId.value).toBe('pr:4');
      expect(t.moveTab('pr:99', '/wt/a', '/wt/b')).toBeNull();
    });

    it('reopens a closed pr tab', () => {
      t.open({ kind: 'pr', number: 5, title: '#5 X' });
      t.close('pr:5');
      expect(t.reopenClosed()).toMatchObject({ id: 'pr:5', number: 5, title: '#5 X' });
    });
  });
});
