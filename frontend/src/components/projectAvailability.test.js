import { describe, expect, it } from 'vitest';
import { availabilityMap, projectItems, statusLabel } from './projectAvailability.js';

const recents = [
  { name: 'app', path: '/code/app' },
  { name: 'old', path: '/code/old' },
  { name: 'plain', path: '/code/plain' },
];

describe('projectItems', () => {
  it('treats unchecked paths as available', () => {
    const items = projectItems(recents, new Map(), '/code/app');

    expect(items.every((i) => !i.disabled)).toBe(true);
    expect(items[0].current).toBe(true);
  });

  it('disables unavailable folders and explains why in the title', () => {
    const map = availabilityMap([
      { path: '/code/app', status: 'ok' },
      { path: '/code/old', status: 'missing' },
      { path: '/code/plain', status: 'not-repo' },
    ]);
    const [app, old, plain] = projectItems(recents, map, '');

    expect(app.disabled).toBe(false);
    expect(old).toMatchObject({ disabled: true, status: 'missing' });
    expect(old.title).toMatch(/no longer exists/);
    expect(plain).toMatchObject({ disabled: true, status: 'not-repo' });
  });

  it('never disables the open project', () => {
    const map = availabilityMap([{ path: '/code/app', status: 'unreadable' }]);

    expect(projectItems(recents, map, '/code/app')[0].disabled).toBe(false);
  });
});

describe('statusLabel', () => {
  it('labels only non-ok statuses', () => {
    expect(statusLabel('ok')).toBeNull();
    expect(statusLabel('missing')).toBe('missing');
    expect(statusLabel('not-repo')).toBe('not a repo');
    expect(statusLabel('unreadable')).toBe('unavailable');
  });
});
