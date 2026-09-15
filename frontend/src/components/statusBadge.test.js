import { describe, expect, it } from 'vitest';
import { statusBadge } from './ChangeTree.jsx';

describe('statusBadge', () => {
  it('maps unmerged codes to conflict-colored badges', () => {
    expect(statusBadge('UU')).toEqual({ glyph: 'M', kind: 'conflict' });
    expect(statusBadge('AA')).toEqual({ glyph: 'A', kind: 'conflict' });
    expect(statusBadge('DD')).toEqual({ glyph: 'D', kind: 'conflict' });
    expect(statusBadge('AU')).toEqual({ glyph: 'A', kind: 'conflict' });
    expect(statusBadge('UA')).toEqual({ glyph: 'A', kind: 'conflict' });
    expect(statusBadge('DU')).toEqual({ glyph: 'D', kind: 'conflict' });
    expect(statusBadge('UD')).toEqual({ glyph: 'D', kind: 'conflict' });
  });

  it('keeps single-letter behavior', () => {
    expect(statusBadge('M')).toEqual({ glyph: 'M', kind: 'modified' });
    expect(statusBadge('A')).toEqual({ glyph: 'A', kind: 'added' });
    expect(statusBadge('D')).toEqual({ glyph: 'D', kind: 'deleted' });
    expect(statusBadge('C')).toEqual({ glyph: 'C', kind: 'conflict' });
    expect(statusBadge('R')).toEqual({ glyph: 'M', kind: 'modified' });
    expect(statusBadge('U')).toEqual({ glyph: 'A', kind: 'added' });
    expect(statusBadge()).toEqual({ glyph: 'M', kind: 'modified' });
  });
});
