import { Annotation, Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { effect } from '@preact/signals';
import { appEditorTheme, appHighlighting } from './theme.js';
import { loadLanguage, languageKeyForPath, usesTabs } from './languages.js';
import {
  editorExtensions,
  forEachView,
  resolveEditorExtensions,
} from '../../../models/editorRegistry.js';

/** Marks transactions that load disk contents (never counted as user edits). */
const External = Annotation.define();

/**
 * @typedef {{
 *   view: EditorView,
 *   isDirty: () => boolean,
 *   markSaved: () => void,
 *   reloadFromDisk: (text: string) => void,
 *   getText: () => string,
 *   setDark: (dark: boolean) => void,
 * }} FileEditorHandle
 */

/** @type {WeakMap<EditorView, FileEditorHandle & { externalCompartment: Compartment }>} */
const handles = new WeakMap();

/** @param {EditorView} view */
export function getHandle(view) {
  return handles.get(view) ?? null;
}

// Push registry extensions (LSP etc.) into every live editor when they change.
effect(() => {
  editorExtensions.value;
  forEachView((view, ctx) => {
    const h = handles.get(view);

    if (!h) return;
    view.dispatch({
      effects: h.externalCompartment.reconfigure(resolveEditorExtensions(ctx)),
    });
  });
});

/** Guess the indent unit: Go uses tabs; otherwise the first indented line wins. */
function detectIndent(text, key) {
  if (usesTabs(key)) return '\t';
  const m = /^( +|\t)\S/m.exec(text.slice(0, 20000));

  if (!m) return '  ';

  return m[1] === '\t' ? '\t' : ' '.repeat(Math.min(Math.max(m[1].length, 2), 8));
}

// ⌘G is goto-line here (findNext lives on F3 / ⇧F3, still in searchKeymap).
const gotoKeymap = [{ key: 'Mod-g', run: gotoLine, preventDefault: true }];
const searchBindings = searchKeymap.filter((b) => b.key !== 'Mod-g' && b.key !== 'Shift-Mod-g');

/**
 * Build the CodeMirror editor for a file tab.
 *
 * @param {{
 *   text: string,
 *   path: string,
 *   ctx: import('../../../models/editorRegistry.js').EditorContext,
 *   dark: boolean,
 *   onDirtyChange: (dirty: boolean) => void,
 *   onSave: () => void,
 * }} opts
 * @returns {Promise<FileEditorHandle>}
 */
export async function createFileEditor({ text, path, ctx, dark, onDirtyChange, onSave }) {
  const language = await loadLanguage(path);
  const key = languageKeyForPath(path);

  const themeCompartment = new Compartment();
  const externalCompartment = new Compartment();
  let reportedDirty = false;
  /** @type {import('@codemirror/state').Text} */
  let savedDoc;

  const state = EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorState.allowMultipleSelections.of(true),
      indentUnit.of(detectIndent(text, key)),
      EditorState.tabSize.of(usesTabs(key) ? 4 : 2),
      themeCompartment.of(appEditorTheme(dark)),
      appHighlighting,
      language ?? [],
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            onSave();

            return true;
          },
        },
        ...gotoKeymap,
        ...searchBindings,
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        if (update.transactions.every((tr) => tr.annotation(External))) return;
        const dirty = !update.state.doc.eq(savedDoc);

        if (dirty !== reportedDirty) {
          reportedDirty = dirty;
          onDirtyChange(dirty);
        }
      }),
      externalCompartment.of(resolveEditorExtensions(ctx)),
    ],
  });
  savedDoc = state.doc;

  const view = new EditorView({ state });

  /** @type {FileEditorHandle & { externalCompartment: Compartment }} */
  const handle = {
    view,
    externalCompartment,
    isDirty: () => reportedDirty,
    getText: () => view.state.doc.toString(),
    markSaved() {
      savedDoc = view.state.doc;

      if (reportedDirty) {
        reportedDirty = false;
        onDirtyChange(false);
      }
    },
    reloadFromDisk(next) {
      if (next === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        annotations: External.of(true),
      });
      savedDoc = view.state.doc;
    },
    setDark(next) {
      view.dispatch({ effects: themeCompartment.reconfigure(appEditorTheme(next)) });
    },
  };
  handles.set(view, handle);

  return handle;
}

export { EditorView };
