/**
 * Just-in-time availability for the project dropdown: the backend stats each
 * recent folder when the menu opens, and these helpers turn the result into
 * menu items. Paths not yet checked are treated as available.
 *
 * @typedef {'ok' | 'missing' | 'not-repo' | 'unreadable'} AvailabilityStatus
 */

const LABELS = {
  missing: 'missing',
  'not-repo': 'not a repo',
  unreadable: 'unavailable',
};

const REASONS = {
  missing: 'Folder no longer exists',
  'not-repo': 'Folder is no longer a git repository',
  unreadable: 'Folder could not be read (disconnected drive or no permission?)',
};

/** Short badge text for a non-ok status, or null. */
export function statusLabel(status) {
  return LABELS[status] ?? null;
}

/** @param {Array<{ path: string, status: AvailabilityStatus }>} list */
export function availabilityMap(list) {
  return new Map((list ?? []).map((r) => [r.path, r.status]));
}

/**
 * @param {Array<{ name: string, path: string }>} recents
 * @param {Map<string, AvailabilityStatus>} availability
 * @param {string} currentPath
 */
export function projectItems(recents, availability, currentPath) {
  return recents.map((p) => {
    const current = p.path === currentPath;
    // The open project is in use, so it is available whatever a stale check said.
    const status = current ? 'ok' : (availability.get(p.path) ?? 'ok');
    const unavailable = status !== 'ok';

    return {
      id: p.path,
      label: p.name,
      sublabel: p.path,
      title: unavailable ? `${REASONS[status]}: ${p.path}` : p.path,
      current,
      disabled: unavailable,
      status,
    };
  });
}
