import { useMemo } from 'preact/hooks';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime.js';
import { parseMarkdown } from '../../lsp/markdown.js';

function Inline({ i }) {
  switch (i.t) {
    case 'code':
      return <code>{i.text}</code>;
    case 'bold':
      return <strong>{i.text}</strong>;
    case 'em':
      return <em>{i.text}</em>;
    case 'link':
      return i.href ? (
        <a
          class="pr-md-link"
          href={i.href}
          title={i.href}
          onClick={(e) => {
            e.preventDefault();
            BrowserOpenURL(i.href);
          }}
        >
          {i.text}
        </a>
      ) : (
        <span>{i.text}</span>
      );
    default:
      return <span>{i.text}</span>;
  }
}

/**
 * Renders PR text with the app's minimal markdown parser. Output is built from
 * Preact elements and text nodes only (no HTML injection); raw HTML in the
 * source shows up as literal text, and only http(s) links are clickable.
 *
 * @param {{ source: string }} props
 */
export function Markdown({ source }) {
  const blocks = useMemo(() => parseMarkdown(source ?? ''), [source]);

  return (
    <div class="pr-md">
      {blocks.map((b, idx) => {
        if (b.type === 'hr') return <hr key={idx} />;

        if (b.type === 'code') {
          return (
            <pre key={idx}>
              <code>{b.text}</code>
            </pre>
          );
        }

        return (
          <p key={idx}>
            {b.inlines.map((i, k) => (
              <Inline key={k} i={i} />
            ))}
          </p>
        );
      })}
    </div>
  );
}
