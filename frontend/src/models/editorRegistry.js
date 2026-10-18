import { signal } from '@preact/signals';
import { tabsStore } from './tabs.js';

/**
 * Registry for the CodeMirror views behind `file` tabs. Deliberately free of
 * CodeMirror imports so callers (navigation, LSP, search) stay in the main
 * bundle; the heavy editor code is loaded lazily by `FileTabEditor`.
 *
 * Extension points for the LSP task:
 *  - `registerEditorExtension(ext)` — add a CodeMirror Extension (or a factory
 *    `(ctx: { path, tabId, scope }) => Extension`) applied to every file editor,
 *    existing and future. Returns an unregister function.
 *  - `getView(tabId)` — the live `EditorView` of a file tab (or null).
 *  - `getViewMeta(view)` — `{ path, tabId, scope }` for a view.
 *  - `revealLine(tabId, line, col)` — scroll + place the cursor.
 *
 * @typedef {{ path: string, tabId: string, scope: string | null }} EditorContext
 * @typedef {unknown | ((ctx: EditorContext) => unknown)} EditorExtensionEntry
 */

/** @type {import('@preact/signals').Signal<EditorExtensionEntry[]>} */
export const editorExtensions = signal([]);

/** @type {Map<string, { view: any, ctx: EditorContext }>} */
const handles = new Map();
/** @type {WeakMap<object, EditorContext>} */
const metaByView = new WeakMap();
/** @type {Map<string, { line: number, col: number }>} */
const pendingReveals = new Map();

function keyOf(scope, tabId) {
  return `${scope ?? ''}|${tabId}`;
}

/** @param {EditorExtensionEntry} entry */
export function registerEditorExtension(entry) {
  editorExtensions.value = [...editorExtensions.peek(), entry];

  return () => {
    editorExtensions.value = editorExtensions.peek().filter((e) => e !== entry);
  };
}

/** Resolve registered entries into plain CodeMirror extensions for one editor. */
export function resolveEditorExtensions(ctx) {
  return editorExtensions
    .peek()
    .map((e) => (typeof e === 'function' ? e(ctx) : e))
    .filter(Boolean);
}

/**
 * Called by the editor host once a view exists.
 * @param {EditorContext} ctx
 * @param {any} view
 */
export function registerView(ctx, view) {
  handles.set(keyOf(ctx.scope, ctx.tabId), { view, ctx });
  metaByView.set(view, ctx);
}

/**
 * @param {string} tabId
 * @param {string | null} [scope] defaults to the active worktree
 */
export function getView(tabId, scope = tabsStore.currentScope()) {
  return handles.get(keyOf(scope, tabId))?.view ?? null;
}

/** @param {object} view */
export function getViewMeta(view) {
  return metaByView.get(view) ?? null;
}

/** View of the active file tab, if the active tab is a file tab. */
export function getActiveView() {
  const tab = tabsStore.activeTab.peek();

  return tab?.kind === 'file' ? getView(tab.id) : null;
}

/** Visit every live editor (all worktrees). */
export function forEachView(fn) {
  for (const { view, ctx } of handles.values()) fn(view, ctx);
}

/**
 * Document offset for a 1-based line/column, clamped into the document.
 * @param {{ lines: number, line: (n: number) => { from: number, length: number } }} doc
 */
export function offsetAt(doc, line, col = 1) {
  const n = Math.max(1, Math.min(Math.floor(line) || 1, doc.lines));
  const l = doc.line(n);
  const c = Math.max(1, Math.floor(col) || 1);

  return l.from + Math.min(c - 1, l.length);
}

/** Place the cursor at line:col and scroll it into view. Returns whether a view took it. */
export function revealInView(view, line, col = 1) {
  if (!view) return false;
  const pos = offsetAt(view.state.doc, line, col);
  // Lazy-resolved so this module never imports CodeMirror.
  const scrollEffect = view.constructor.scrollIntoView(pos, { y: 'center' });
  view.dispatch({ selection: { anchor: pos }, effects: scrollEffect });

  return true;
}

/**
 * Reveal line:col (1-based) in the file tab's editor. If the editor is not
 * mounted yet (tab just opened, still loading, or inactive), the request is
 * remembered and applied by the host when it attaches.
 */
export function revealLine(tabId, line, col = 1, scope = tabsStore.currentScope()) {
  const key = keyOf(scope, tabId);
  const handle = handles.get(key);

  if (handle?.view.dom.isConnected) {
    pendingReveals.delete(key);

    return revealInView(handle.view, line, col);
  }

  pendingReveals.set(key, { line, col });

  return false;
}

/** Host calls this after attaching a view to the DOM. */
export function consumePendingReveal(ctx) {
  const key = keyOf(ctx.scope, ctx.tabId);
  const pending = pendingReveals.get(key);
  pendingReveals.delete(key);

  return pending ?? null;
}

/** @type {Set<(ctx: EditorContext) => void>} */
const savedListeners = new Set();

/** Subscribe to successful saves of file tabs. Returns unsubscribe. */
export function onFileSaved(fn) {
  savedListeners.add(fn);

  return () => savedListeners.delete(fn);
}

/** The host calls this after a file tab was written to disk. */
export function notifyFileSaved(ctx) {
  for (const fn of savedListeners) fn(ctx);
}

/** Forget a view (tab closed / worktree removed). Destroys the view. */
export function disposeView(scope, tabId) {
  const key = keyOf(scope, tabId);
  const handle = handles.get(key);
  pendingReveals.delete(key);

  if (!handle) return;
  handles.delete(key);
  handle.view.destroy();
}

// File tabs that leave the strip drop their editor (unsaved edits were confirmed away).
tabsStore.onDiscard((scope, tab) => {
  if (tab.kind === 'file') disposeView(scope, tab.id);
});
