import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Editor theme driven by the app's CSS variables (index.css), so light/dark
 * follow the app for free. Syntax colors mirror theme/adapter.js's Shiki
 * mapping: monochrome — comments/punctuation/strings/numbers muted, keywords
 * normal, functions and types emphasised.
 *
 * @param {boolean} dark CodeMirror's dark flag (default selection/tooltip styling)
 */
export function appEditorTheme(dark) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--text)',
        backgroundColor: 'var(--surface-raised)',
        fontSize: '12.5px',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.55',
        overflow: 'auto',
      },
      '.cm-content': { caretColor: 'var(--text)', padding: '8px 0' },
      '.cm-line': { padding: '0 14px 0 8px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: 'rgba(127, 127, 127, 0.28)' },
      '.cm-activeLine': { backgroundColor: 'var(--accent-bg)' },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-raised)',
        color: 'var(--text-muted)',
        border: 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 14px', minWidth: '36px' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--accent-bg)', color: 'var(--text)' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(127, 127, 127, 0.28)',
        outline: '1px solid var(--border)',
      },
      '.cm-nonmatchingBracket': { color: 'var(--removed)' },
      '.cm-selectionMatch': { backgroundColor: 'rgba(127, 127, 127, 0.18)' },
      '.cm-searchMatch': {
        backgroundColor: 'rgba(127, 127, 127, 0.22)',
        outline: '1px solid var(--border)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(127, 127, 127, 0.42)' },
      '.cm-panels': {
        backgroundColor: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
      },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
      '.cm-panel.cm-search': { padding: '6px 10px' },
      '.cm-panel input, .cm-panel button, .cm-panel label': { fontFamily: 'inherit', fontSize: 'inherit' },
      '.cm-textfield': {
        backgroundColor: 'var(--surface-raised)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        padding: '2px 6px',
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: 'var(--surface-raised)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--surface-raised)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--accent-bg)',
        border: 'none',
        color: 'var(--text-muted)',
      },
    },
    { dark }
  );
}

const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.docString], color: 'var(--text-muted)', fontStyle: 'italic' },
  {
    tag: [t.punctuation, t.bracket, t.separator, t.operator, t.derefOperator],
    color: 'var(--text-muted)',
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], color: 'var(--text-muted)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.character], color: 'var(--text-muted)' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--text)', fontWeight: '600' },
  { tag: [t.definitionKeyword, t.moduleKeyword], color: 'var(--text)', fontWeight: '600' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--text-h)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--text-h)' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: 'var(--text-h)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--text)' },
  { tag: [t.tagName], color: 'var(--text)', fontWeight: '600' },
  { tag: [t.attributeName], color: 'var(--text-muted)' },
  { tag: [t.heading], color: 'var(--text-h)', fontWeight: '600' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--text-muted)', textDecoration: 'underline' },
  { tag: [t.invalid], color: 'var(--removed)' },
]);

export const appHighlighting = syntaxHighlighting(highlightStyle);
