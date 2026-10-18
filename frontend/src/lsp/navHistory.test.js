import { describe, expect, it } from 'vitest';
import { createNavHistory } from './navHistory.js';

const L = (path, line) => ({ path, line, col: 1 });

describe('navHistory', () => {
  it('goes back and forward across files', () => {
    const h = createNavHistory();
    h.push(L('a.go', 1)); // jumped a:1 -> b
    h.push(L('b.go', 5)); // jumped b:5 -> c
    const back1 = h.back(L('c.go', 9));
    expect(back1).toEqual(L('b.go', 5));
    const back2 = h.back(back1);
    expect(back2).toEqual(L('a.go', 1));
    expect(h.back(back2)).toBeNull();
  });

  it('forward returns where back came from; a new jump clears forward', () => {
    const h = createNavHistory();
    h.push(L('a.go', 1));
    const b = h.back(L('b.go', 2));
    expect(b).toEqual(L('a.go', 1));
    expect(h.canForward).toBe(true);
    expect(h.forward(b)).toEqual(L('b.go', 2));
    expect(h.canBack).toBe(true);
    h.back(L('b.go', 2));
    h.push(L('a.go', 1));
    expect(h.canForward).toBe(false);
  });

  it('ignores duplicate consecutive entries and caps size', () => {
    const h = createNavHistory(3);
    h.push(L('a', 1));
    h.push(L('a', 1));
    expect(h.back(null)).toEqual(L('a', 1));
    expect(h.back(null)).toBeNull();

    for (let i = 0; i < 10; i++) h.push(L('f', i));
    let n = 0;

    while (h.back(null)) n++;
    expect(n).toBe(3);
  });
});
