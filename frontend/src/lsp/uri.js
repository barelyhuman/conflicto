/** Mapping between repo-relative paths and file:// URIs under the workspace root. */

const trimSlash = (s) => s.replace(/\/+$/, '');

/** @param {string} rootUri @param {string} path repo-relative */
export function pathToUri(rootUri, path) {
  const rel = path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  return `${trimSlash(rootUri)}/${rel}`;
}

/**
 * Repo-relative path for a URI inside the workspace, else null (outside root
 * such as GOROOT or a global node_modules).
 * @param {string} rootUri @param {string} uri
 */
export function uriToPath(rootUri, uri) {
  const root = `${trimSlash(rootUri)}/`;

  if (!uri.startsWith(root)) return null;

  try {
    return decodeURIComponent(uri.slice(root.length));
  } catch {
    return null;
  }
}

/**
 * Normalise Location | LocationLink | arrays into jump targets.
 * @param {string} rootUri
 * @param {any} result
 * @returns {{ path: string | null, uri: string, line: number, col: number }[]} 1-based line/col
 */
export function locationsToTargets(rootUri, result) {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  const out = [];

  for (const loc of list) {
    const uri = loc.targetUri ?? loc.uri;
    const range = loc.targetSelectionRange ?? loc.targetRange ?? loc.range;

    if (!uri || !range) continue;
    out.push({
      uri,
      path: uriToPath(rootUri, uri),
      line: range.start.line + 1,
      col: range.start.character + 1,
    });
  }

  return out;
}
