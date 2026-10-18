/**
 * Tiny, safe markdown for hover tooltips. Produces a plain data tree; the
 * caller builds DOM nodes with textContent only, so no input can inject HTML.
 *
 * Supported: fenced code, inline code, **bold**, *em*, [text](url) (rendered
 * as text; href kept only for http/https), headings (as bold), lists (bullets),
 * horizontal rules, paragraphs. Everything else is literal text.
 *
 * @typedef {{ t: 'text'|'code'|'bold'|'em'|'link', text: string, href?: string }} Inline
 * @typedef {{ type: 'code', lang: string, text: string }
 *   | { type: 'p', inlines: Inline[] }
 *   | { type: 'hr' }} Block
 */

/** Flatten LSP Hover.contents (MarkupContent | MarkedString | MarkedString[]) to markdown. */
export function hoverToMarkdown(contents) {
  if (!contents) return '';

  if (typeof contents === 'string') return contents;

  if (Array.isArray(contents)) {
    return contents.map(hoverToMarkdown).filter(Boolean).join('\n\n');
  }

  // MarkedString { language, value }
  if (contents.language) return '```' + contents.language + '\n' + contents.value + '\n```';

  if (contents.kind === 'plaintext') return escapeMarkdown(String(contents.value ?? ''));

  return String(contents.value ?? '');
}

function escapeMarkdown(text) {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s][^*]*)\*(?!\*)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** @param {string} src @returns {Inline[]} */
export function parseInline(src) {
  /** @type {Inline[]} */
  const out = [];
  let last = 0;
  const push = (t, text, href) => {
    if (text) out.push(href ? { t, text, href } : { t, text });
  };

  for (const m of src.matchAll(INLINE)) {
    push('text', unescape(src.slice(last, m.index)));
    last = m.index + m[0].length;

    if (m[2] !== undefined) push('code', m[2].trim());
    else if (m[3] !== undefined) push('bold', m[3]);
    else if (m[4] !== undefined) push('em', m[4]);
    else push('link', m[5], /^https?:\/\//i.test(m[6]) ? m[6] : undefined);
  }

  push('text', unescape(src.slice(last)));

  return out;
}

function unescape(s) {
  return s.replace(/\\([\\`*_[\]()#+\-.!{}<>|])/g, '$1');
}

/** @param {string} md @returns {Block[]} */
export function parseMarkdown(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  /** @type {Block[]} */
  const blocks = [];
  let para = [];

  const flush = () => {
    if (para.length) blocks.push({ type: 'p', inlines: parseInline(para.join(' ')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)/.exec(line);

    if (fence) {
      flush();
      const body = [];
      i++;

      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line);

    if (heading) {
      flush();
      blocks.push({
        type: 'p',
        inlines: [{ t: 'bold', text: heading[1].replace(/\s*#+\s*$/, '') }],
      });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);

    if (bullet) {
      flush();
      blocks.push({ type: 'p', inlines: [{ t: 'text', text: '• ' }, ...parseInline(bullet[1])] });
      continue;
    }

    // Hard line break (two trailing spaces) stays a space; fine for hovers.
    para.push(line.trim());
  }

  flush();

  return blocks;
}

/**
 * Build DOM for blocks. Only createElement/textContent: never innerHTML.
 * @param {Document} doc @param {Block[]} blocks
 */
export function renderBlocks(doc, blocks) {
  const root = doc.createElement('div');
  root.className = 'lsp-md';

  for (const b of blocks) {
    if (b.type === 'hr') {
      root.appendChild(doc.createElement('hr'));
    } else if (b.type === 'code') {
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');
      code.textContent = b.text;
      pre.appendChild(code);
      root.appendChild(pre);
    } else {
      const p = doc.createElement('p');

      for (const i of b.inlines) {
        const el = doc.createElement(
          { code: 'code', bold: 'strong', em: 'em', link: 'span', text: 'span' }[i.t]
        );
        el.textContent = i.text;

        if (i.t === 'link') {
          el.className = 'lsp-md-link';

          if (i.href) el.title = i.href;
        }

        p.appendChild(el);
      }

      root.appendChild(p);
    }
  }

  return root;
}
