import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from './shortcuts.js';

const SCOPES = ['global', 'editor', 'diff', 'review', 'terminal', 'home', 'palette'];

/**
 * Clashes that exist in the app today and are accepted for now. Each one must
 * still be a real clash, so stale entries fail the test.
 *
 * - Ctrl+F: on Windows the "Full Screen" menu accelerator (main.go, keys.CmdOrCtrl("f"))
 *   takes precedence over CodeMirror's find (Mod-f). The menu is removed on Linux, and
 *   macOS uses Ctrl+Cmd+F for full screen, so this only bites on Windows.
 */
const KNOWN_CLASHES = [
  { a: 'app.fullscreen', b: 'editor.find', field: 'other', reason: 'Windows: Full Screen menu accelerator shadows CodeMirror find' },
];

function overlaps(a, b) {
  return a.scope === b.scope || a.scope === 'global' || b.scope === 'global';
}

function conflictsFor(field) {
  const found = [];

  for (let i = 0; i < SHORTCUTS.length; i += 1) {
    for (let j = i + 1; j < SHORTCUTS.length; j += 1) {
      const a = SHORTCUTS[i];
      const b = SHORTCUTS[j];

      if (!overlaps(a, b)) continue;
      if (!a[field] || a[field] !== b[field]) continue;
      found.push({ a: a.id, b: b.id, field, combo: a[field] });
    }
  }

  return found;
}

function isAllowed({ a, b, field }) {
  return KNOWN_CLASHES.some(
    (k) => k.field === field && ((k.a === a && k.b === b) || (k.a === b && k.b === a)),
  );
}

describe('shortcuts registry', () => {
  it('has unique ids and valid scopes', () => {
    const ids = SHORTCUTS.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(SCOPES, s.id).toContain(s.scope);
      expect(s.description, s.id).toBeTruthy();
    }
  });

  it('has no unexpected mac combo clashes in overlapping scopes', () => {
    const conflicts = conflictsFor('mac').filter((c) => !isAllowed(c));

    expect(conflicts).toEqual([]);
  });

  it('has no unexpected other-platform combo clashes in overlapping scopes', () => {
    const conflicts = conflictsFor('other').filter((c) => !isAllowed(c));

    expect(conflicts).toEqual([]);
  });

  it('keeps the known-clash allowlist current', () => {
    for (const k of KNOWN_CLASHES) {
      const still = conflictsFor(k.field).some(
        (c) => (c.a === k.a && c.b === k.b) || (c.a === k.b && c.b === k.a),
      );

      expect(still, `${k.a} vs ${k.b} (${k.reason}) no longer clashes; remove it`).toBe(true);
    }
  });
});
