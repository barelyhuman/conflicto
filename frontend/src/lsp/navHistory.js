/**
 * Back/forward stack for code jumps (goto-definition, references, search).
 * Locations are repo-relative with optional 1-based line/col.
 *
 * @typedef {{ path: string, line?: number | null, col?: number | null }} CodeLocation
 */

const sameLoc = (a, b) => a.path === b.path && (a.line ?? null) === (b.line ?? null);

export function createNavHistory(limit = 100) {
  /** @type {CodeLocation[]} */
  let backStack = [];
  /** @type {CodeLocation[]} */
  let fwdStack = [];

  return {
    /** Record the location being left before a jump; clears forward history. */
    push(from) {
      if (!from?.path) return;

      if (backStack.length && sameLoc(backStack[backStack.length - 1], from)) return;
      backStack.push({ ...from });

      if (backStack.length > limit) backStack = backStack.slice(-limit);
      fwdStack = [];
    },

    /** @returns {CodeLocation | null} where to go; `current` becomes forward-able */
    back(current) {
      const target = backStack.pop();

      if (!target) return null;

      if (current?.path) fwdStack.push({ ...current });

      return target;
    },

    forward(current) {
      const target = fwdStack.pop();

      if (!target) return null;

      if (current?.path) backStack.push({ ...current });

      return target;
    },

    get canBack() {
      return backStack.length > 0;
    },

    get canForward() {
      return fwdStack.length > 0;
    },

    clear() {
      backStack = [];
      fwdStack = [];
    },
  };
}
