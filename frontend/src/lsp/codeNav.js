import { classifyMatches } from './definitionHeuristic.js';
import { languageGlob } from './languageId.js';
import { locationsToTargets, pathToUri } from './uri.js';

/**
 * Goto-definition and find-references with a text-search fallback. Pure
 * orchestration over injected dependencies so it can be tested without
 * CodeMirror or Wails.
 *
 * @typedef {import('./navHistory.js').CodeLocation} CodeLocation
 * @typedef {{ path: string, languageId: string, position: { line: number, character: number }, word: string }} Request
 *
 * @param {{
 *   session: ReturnType<typeof import('./session.js').createLspSession>,
 *   searchText: (opts: object) => Promise<{ path: string, line: number, col: number, text: string }[]>,
 *   openFileAt: (path: string, line?: number | null, col?: number | null) => unknown,
 *   history: ReturnType<typeof import('./navHistory.js').createNavHistory>,
 *   getCurrent: () => CodeLocation | null,
 *   showResults: (state: { title: string, items: any[] }) => void,
 *   readLines?: (path: string) => Promise<string[] | null>,
 *   notify?: (message: string) => void,
 * }} deps
 */
export function createCodeNav({
  session,
  searchText,
  openFileAt,
  history,
  getCurrent,
  showResults,
  readLines = async () => null,
  notify = () => {},
}) {
  function jump(path, line, col) {
    const from = getCurrent();

    if (from) history.push(from);

    return openFileAt(path, line, col);
  }

  async function textMatches(word, languageId) {
    try {
      return (
        (await searchText({
          query: word,
          regex: false,
          caseSensitive: true,
          wholeWord: true,
          glob: languageGlob(languageId),
          limit: 200,
        })) ?? []
      );
    } catch {
      return [];
    }
  }

  async function withPreviews(targets, len) {
    /** @type {Map<string, string[] | null>} */
    const cache = new Map();
    const items = [];

    for (const t of targets) {
      if (!cache.has(t.path)) cache.set(t.path, await readLines(t.path));
      const text = cache.get(t.path)?.[t.line - 1] ?? '';
      items.push({ path: t.path, line: t.line, col: t.col, text, len });
    }

    return items;
  }

  /** Targets inside the workspace; announces when everything is outside it. */
  function inWorkspace(targets) {
    const local = targets.filter((t) => t.path);

    if (!local.length && targets.length) notify('Definition is outside the workspace');

    return local;
  }

  const api = {
    /** @param {Request} req */
    async gotoDefinition({ path, languageId, position, word }) {
      const client = session.readyClientFor(languageId);

      if (client) {
        try {
          const res = await client.definition(pathToUri(client.rootUri, path), position);
          const targets = inWorkspace(locationsToTargets(client.rootUri, res));

          if (targets.length === 1) {
            jump(targets[0].path, targets[0].line, targets[0].col);

            return 'lsp';
          }

          if (targets.length > 1) {
            showResults({
              title: `Definitions of ${word}`,
              items: await withPreviews(targets, word.length),
            });

            return 'lsp-multiple';
          }
        } catch {
          // fall through to text search
        }
      }

      if (!word) return 'none';
      const matches = await textMatches(word, languageId);
      const { strong, weak } = classifyMatches(matches, word, languageId);

      if (strong.length === 1) {
        jump(strong[0].path, strong[0].line, strong[0].col);

        return 'text';
      }

      const items = [...strong, ...weak].map((m) => ({ ...m, len: word.length }));

      if (!items.length) {
        notify(`No definition found for ${word}`);

        return 'none';
      }

      showResults({
        title: `${strong.length ? 'Definition candidates' : 'Text matches'} for ${word}`,
        items,
      });

      return 'text-multiple';
    },

    /** @param {Request} req */
    async findReferences({ path, languageId, position, word }) {
      const client = session.readyClientFor(languageId);

      if (client) {
        try {
          const res = await client.references(pathToUri(client.rootUri, path), position);
          const targets = locationsToTargets(client.rootUri, res).filter((t) => t.path);
          showResults({
            title: `References to ${word}`,
            items: await withPreviews(targets, word.length),
          });

          return 'lsp';
        } catch {
          // fall through
        }
      }

      if (!word) return 'none';
      const matches = await textMatches(word, languageId);
      showResults({
        title: `Text matches for ${word}`,
        items: matches.map((m) => ({ ...m, len: word.length })),
      });

      return 'text';
    },

    /** Back / forward through jump history across tabs. */
    back() {
      const target = history.back(getCurrent());

      return target ? openFileAt(target.path, target.line, target.col) : false;
    },

    forward() {
      const target = history.forward(getCurrent());

      return target ? openFileAt(target.path, target.line, target.col) : false;
    },
  };

  return api;
}
