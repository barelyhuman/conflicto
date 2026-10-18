// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hoverToMarkdown, parseInline, parseMarkdown, renderBlocks } from './markdown.js';

describe('hoverToMarkdown', () => {
  it('flattens MarkupContent, MarkedString and arrays', () => {
    expect(hoverToMarkdown({ kind: 'markdown', value: 'hi' })).toBe('hi');
    expect(hoverToMarkdown({ language: 'go', value: 'func f()' })).toBe('```go\nfunc f()\n```');
    expect(hoverToMarkdown(['a', { language: 'ts', value: 'x' }])).toBe('a\n\n```ts\nx\n```');
    expect(hoverToMarkdown({ kind: 'plaintext', value: '*not bold*' })).toBe('\\*not bold\\*');
    expect(hoverToMarkdown(null)).toBe('');
  });
});

describe('parseMarkdown', () => {
  it('parses fenced code, paragraphs, headings, lists, rules', () => {
    const blocks = parseMarkdown(
      '```go\nfunc f()\n```\n\n# Title\n\nline one\nline two\n\n- item `x`\n\n---'
    );
    expect(blocks[0]).toEqual({ type: 'code', lang: 'go', text: 'func f()' });
    expect(blocks[1]).toEqual({ type: 'p', inlines: [{ t: 'bold', text: 'Title' }] });
    expect(blocks[2]).toEqual({ type: 'p', inlines: [{ t: 'text', text: 'line one line two' }] });
    expect(blocks[3].inlines).toEqual([
      { t: 'text', text: '• ' },
      { t: 'text', text: 'item ' },
      { t: 'code', text: 'x' },
    ]);
    expect(blocks[4]).toEqual({ type: 'hr' });
  });

  it('only keeps http(s) hrefs on links', () => {
    expect(parseInline('[a](https://x.io) [b](javascript:alert)')).toEqual([
      { t: 'link', text: 'a', href: 'https://x.io' },
      { t: 'text', text: ' ' },
      { t: 'link', text: 'b' },
    ]);
  });

  it('never produces HTML: markup is carried as text', () => {
    const blocks = parseMarkdown('<img src=x onerror=alert(1)> <script>x</script>');
    expect(blocks).toEqual([
      { type: 'p', inlines: [{ t: 'text', text: '<img src=x onerror=alert(1)> <script>x</script>' }] },
    ]);
  });
});

describe('renderBlocks', () => {
  it('builds elements with textContent only', () => {
    const made = [];
    const el = (tag) => {
      const e = { tag, children: [], className: '', title: '', textContent: '' };
      e.appendChild = (c) => e.children.push(c);
      made.push(e);

      return e;
    };
    const root = renderBlocks({ createElement: el }, parseMarkdown('<b>x</b> `c`'));
    expect(root.tag).toBe('div');
    const texts = made.filter((e) => e.textContent).map((e) => e.textContent);
    expect(texts).toContain('<b>x</b> ');
    expect(texts).toContain('c');
    expect(made.every((e) => !('innerHTML' in e))).toBe(true);
  });
});
