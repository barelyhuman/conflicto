import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { createDirtyTracker } from './dirtyTracker.js';

const doc = (s) => Text.of(s.split('\n'));

describe('createDirtyTracker', () => {
  it('reports dirty once the document differs from the saved one', () => {
    const seen = [];
    const t = createDirtyTracker(doc('a'), (d) => seen.push(d));
    t.update(doc('ab'));
    expect(t.isDirty()).toBe(true);
    t.update(doc('a'));
    expect(t.isDirty()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it('stays dirty when the document changed while the save was in flight', () => {
    const seen = [];
    const t = createDirtyTracker(doc('a'), (d) => seen.push(d));
    const written = doc('ab');
    t.update(written);
    // The user types "c" while writeFile("ab") is pending.
    t.update(doc('abc'));
    t.markSaved(written, doc('abc'));
    expect(t.isDirty()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('becomes clean when the saved document is still current', () => {
    const seen = [];
    const t = createDirtyTracker(doc('a'), (d) => seen.push(d));
    t.update(doc('ab'));
    t.markSaved(doc('ab'), doc('ab'));
    expect(t.isDirty()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});
