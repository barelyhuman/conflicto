/**
 * Ripgrep-fallback goto-definition: classify text matches of a word as
 * definition-looking ("strong") using small per-language patterns.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @param {string} word @returns {Record<string, RegExp[]>} patterns keyed by language family */
function patterns(word) {
  const w = escapeRe(word);

  const js = [
    new RegExp(`^\\s*(export\\s+)?(default\\s+)?(async\\s+)?function\\*?\\s+${w}\\b`),
    new RegExp(`^\\s*(export\\s+)?(default\\s+)?(abstract\\s+)?class\\s+${w}\\b`),
    new RegExp(`^\\s*(export\\s+)?(declare\\s+)?(const|let|var)\\s+${w}\\b`),
    new RegExp(`^\\s*(export\\s+)?(declare\\s+)?(interface|type|enum|namespace)\\s+${w}\\b`),
    new RegExp(`^\\s*export\\s+.*\\b${w}\\b`),
    // method / property shorthand in a class or object literal
    new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|static\\s+|async\\s+|readonly\\s+)*${w}\\s*(<[^>]*>)?\\([^)]*\\)\\s*(:[^{=]+)?\\{`),
    new RegExp(`^\\s*(public\\s+|private\\s+|protected\\s+|static\\s+|readonly\\s+)*${w}\\s*[:=?]`),
  ];

  return {
    go: [
      new RegExp(`^\\s*func\\s+(\\([^)]*\\)\\s*)?${w}\\b`),
      new RegExp(`^\\s*type\\s+${w}\\b`),
      new RegExp(`^\\s*(const|var)\\s+${w}\\b`),
      new RegExp(`^\\s*${w}\\s*:=`),
      new RegExp(`^\\s*[\\w, ]*\\b${w}\\b[\\w, ]*:=`),
      // inside a const/var/type ( ... ) block: `Name Type` or `Name = value`
      new RegExp(`^\\s+${w}\\s+(=|[\\w*\\[\\]{}.]+)\\s*(=|$|//)`),
    ],
    js,
    python: [
      new RegExp(`^\\s*(async\\s+)?def\\s+${w}\\b`),
      new RegExp(`^\\s*class\\s+${w}\\b`),
      new RegExp(`^${w}\\s*(:[^=]+)?=`),
    ],
    rust: [
      new RegExp(`^\\s*(pub(\\([^)]*\\))?\\s+)?(async\\s+)?(unsafe\\s+)?fn\\s+${w}\\b`),
      new RegExp(`^\\s*(pub(\\([^)]*\\))?\\s+)?(struct|enum|trait|type|mod|union)\\s+${w}\\b`),
      new RegExp(`^\\s*(pub(\\([^)]*\\))?\\s+)?(const|static)\\s+(mut\\s+)?${w}\\b`),
      new RegExp(`^\\s*let\\s+(mut\\s+)?${w}\\b`),
    ],
  };
}

function familyOf(languageId) {
  switch (languageId) {
    case 'go':
    case 'gomod':
      return 'go';
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return 'js';
    case 'python':
      return 'python';
    case 'rust':
      return 'rust';
    default:
      return null;
  }
}

/** Does this source line look like it defines `word`? */
export function looksLikeDefinition(line, word, languageId) {
  const family = familyOf(languageId);

  if (!family || !word) return false;

  return patterns(word)[family].some((re) => re.test(line));
}

/**
 * Split matches into definition-looking ones and the rest; stable order.
 * @template {{ text: string }} M
 * @param {M[]} matches @param {string} word @param {string | null} languageId
 * @returns {{ strong: M[], weak: M[] }}
 */
export function classifyMatches(matches, word, languageId) {
  const strong = [];
  const weak = [];

  for (const m of matches) {
    (looksLikeDefinition(m.text, word, languageId) ? strong : weak).push(m);
  }

  return { strong, weak };
}
