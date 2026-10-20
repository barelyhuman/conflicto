import { EditorView, ViewPlugin, hoverTooltip, keymap } from '@codemirror/view';
import { autocompletion, pickedCompletion } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { effect } from '@preact/signals';
import { registerEditorExtension, onFileSaved } from '../../../models/editorRegistry.js';
import { lspLanguageId } from '../../../lsp/languageId.js';
import { pathToUri } from '../../../lsp/uri.js';
import {
  changesToLsp,
  offsetToPosition,
  positionToOffset,
  rangeToOffsets,
} from '../../../lsp/positions.js';
import { hoverToMarkdown, parseMarkdown, renderBlocks } from '../../../lsp/markdown.js';
import { codeNav, diagnosticsBus, lspSession } from '../../../lsp/index.js';

/**
 * CodeMirror side of the LSP client: document sync, hover, goto-definition,
 * find-references, completion and diagnostics. Registered once through the
 * editor registry; every feature checks that the server is ready and
 * otherwise degrades (goto falls back to text search, others do nothing).
 */

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

const SEVERITY = { 1: 'error', 2: 'warning', 3: 'info', 4: 'info' };

const COMPLETION_TYPES = {
  2: 'method',
  3: 'function',
  4: 'function',
  5: 'property',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'namespace',
  10: 'property',
  13: 'enum',
  14: 'keyword',
  15: 'text',
  20: 'constant',
  21: 'constant',
  22: 'class',
  25: 'type',
};

/** Defensive: strip snippet syntax if a server ignores snippetSupport:false. */
export function stripSnippet(text) {
  return text.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '');
}

function toDiagnostics(doc, list) {
  return list.map((d) => {
    const [from, rawTo] = rangeToOffsets(doc, d.range);
    // Zero-width ranges would draw nothing; widen to one character.
    const to = rawTo > from ? rawTo : Math.min(doc.length, from + 1);

    return {
      from,
      to,
      severity: SEVERITY[d.severity] ?? 'info',
      message: d.message,
      source: d.source,
    };
  });
}

/** @param {import('../../../models/editorRegistry.js').EditorContext} ctx @param {string} languageId */
function docSyncPlugin(ctx, languageId) {
  return ViewPlugin.define((view) => {
    let client = null;
    let uri = null;
    let destroyed = false;
    let unsubDiagnostics = null;
    let unsubSaved = null;

    function detach() {
      unsubDiagnostics?.();
      unsubSaved?.();
      unsubDiagnostics = unsubSaved = null;

      if (client && uri && !client.disposed) client.closeDoc(uri);
      client = uri = null;
    }

    function sync() {
      if (destroyed) return;

      // Only the active worktree's documents are open on its servers.
      if (ctx.scope !== lspSession.root.peek()) {
        detach();

        return;
      }

      lspSession.ensure(languageId);
      const next = lspSession.syncClientFor(languageId);

      if (next === client) return;
      detach();

      if (!next) return;
      client = next;
      uri = pathToUri(next.rootUri, ctx.path);
      next.openDoc(uri, languageId, view.state.doc.toString());
      unsubDiagnostics = diagnosticsBus.subscribe(uri, (list) => {
        if (destroyed) return;
        view.dispatch(setDiagnostics(view.state, toDiagnostics(view.state.doc, list)));
      });
      unsubSaved = onFileSaved((saved) => {
        if (saved.tabId === ctx.tabId && saved.scope === ctx.scope) {
          client?.saveDoc(uri, view.state.doc.toString());
        }
      });
    }

    const stop = effect(() => {
      lspSession.root.value;
      lspSession.servers.value;
      lspSession.epoch.value;
      // Out of the effect: sync may start servers, which write signals.
      queueMicrotask(sync);
    });

    return {
      update(update) {
        if (!client || !update.docChanged) return;
        client.changeDoc(uri, {
          incremental: () => changesToLsp(update.startState.doc, update.changes),
          fullText: () => update.state.doc.toString(),
        });
      },
      destroy() {
        destroyed = true;
        stop();
        detach();
      },
    };
  });
}

function readyClient(ctx, languageId) {
  if (ctx.scope !== lspSession.root.peek()) return null;
  const client = lspSession.readyClientFor(languageId);

  return client?.hasDoc(pathToUri(client.rootUri, ctx.path)) ? client : null;
}

function requestFor(view, ctx, languageId, pos) {
  const word = view.state.wordAt(pos);

  return {
    path: ctx.path,
    languageId,
    position: offsetToPosition(view.state.doc, pos),
    word: word ? view.state.sliceDoc(word.from, word.to) : '',
  };
}

function hoverExtension(ctx, languageId) {
  return hoverTooltip(
    async (view, pos) => {
      const client = readyClient(ctx, languageId);

      if (!client) return null;
      const uri = pathToUri(client.rootUri, ctx.path);
      const res = await client
        .hover(uri, offsetToPosition(view.state.doc, pos))
        .catch(() => null);
      const md = hoverToMarkdown(res?.contents);

      if (!md.trim()) return null;
      const [from, to] = res.range ? rangeToOffsets(view.state.doc, res.range) : [pos, pos];

      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-lsp-hover';
          dom.appendChild(renderBlocks(document, parseMarkdown(md)));

          return { dom };
        },
      };
    },
    { hoverTime: 350 }
  );
}

function completionExtension(ctx, languageId) {
  async function source(cctx) {
    const client = readyClient(ctx, languageId);

    if (!client) return null;
    const triggers = client.capabilities?.completionProvider?.triggerCharacters ?? [];
    const prev = cctx.pos > 0 ? cctx.state.sliceDoc(cctx.pos - 1, cctx.pos) : '';
    const word = cctx.matchBefore(/[\w$]*/);
    const isTrigger = triggers.includes(prev);

    if (!cctx.explicit && !isTrigger && (!word || word.from === word.to)) return null;

    const ac = new AbortController();
    cctx.addEventListener('abort', () => ac.abort());
    const uri = pathToUri(client.rootUri, ctx.path);
    let res;

    try {
      res = await client.completion(
        uri,
        offsetToPosition(cctx.state.doc, cctx.pos),
        isTrigger ? { triggerKind: 2, triggerCharacter: prev } : { triggerKind: 1 },
        ac.signal
      );
    } catch {
      return null;
    }

    const list = Array.isArray(res) ? res : (res?.items ?? []);

    if (!list.length) return null;
    const doc = cctx.state.doc;
    const first = list.find((i) => i.textEdit?.range ?? i.textEdit?.replace);
    const firstRange = first && (first.textEdit.range ?? first.textEdit.replace);
    const from = firstRange
      ? positionToOffset(doc, firstRange.start)
      : isTrigger && (!word || word.from === word.to)
        ? cctx.pos
        : (word?.from ?? cctx.pos);
    const resolvable = !!client.capabilities?.completionProvider?.resolveProvider;

    const options = list.map((item, i) => ({
      label: item.label,
      detail: item.detail,
      type: COMPLETION_TYPES[item.kind],
      boost: Math.max(-99, 99 - i),
      info: item.documentation || resolvable
        ? async () => {
            let doc = item.documentation;

            if (!doc && resolvable) {
              doc = (await client.resolveCompletion(item).catch(() => null))?.documentation;
            }

            const md = hoverToMarkdown(doc);

            return md.trim() ? renderBlocks(document, parseMarkdown(md)) : null;
          }
        : undefined,
      apply(view, completion, applyFrom, applyTo) {
        const edit = item.textEdit;
        const range = edit?.range ?? edit?.replace;
        const raw = edit?.newText ?? item.insertText ?? item.label;
        const text = item.insertTextFormat === 2 ? stripSnippet(raw) : raw;
        const [rs, re] = range
          ? [positionToOffset(view.state.doc, range.start), positionToOffset(view.state.doc, range.end)]
          : [applyFrom, applyTo];
        const changes = [{ from: rs, to: Math.max(re, applyTo), insert: text }];

        for (const extra of item.additionalTextEdits ?? []) {
          const [a, b] = rangeToOffsets(view.state.doc, extra.range);
          changes.push({ from: a, to: b, insert: extra.newText });
        }

        const set = view.state.changes(changes);
        view.dispatch({
          changes: set,
          selection: { anchor: set.mapPos(Math.max(re, applyTo), 1) },
          userEvent: 'input.complete',
          annotations: pickedCompletion.of(completion),
        });
      },
    }));

    return {
      from,
      options,
      validFor: res?.isIncomplete ? undefined : /^[\w$]*$/,
    };
  }

  return autocompletion({ override: [source], icons: false });
}

function navigationExtension(ctx, languageId) {
  const gotoAt = (view, pos) => {
    codeNav.gotoDefinition(requestFor(view, ctx, languageId, pos));
  };

  return [
    keymap.of([
      {
        key: 'F12',
        preventDefault: true,
        run: (view) => {
          gotoAt(view, view.state.selection.main.head);

          return true;
        },
      },
      {
        key: 'Shift-F12',
        preventDefault: true,
        run: (view) => {
          codeNav.findReferences(requestFor(view, ctx, languageId, view.state.selection.main.head));

          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const mod = isMac ? event.metaKey : event.ctrlKey;

        if (!mod || event.button !== 0 || event.shiftKey || event.altKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

        if (pos == null) return false;
        event.preventDefault();
        gotoAt(view, pos);

        return true;
      },
    }),
  ];
}

/** @param {import('../../../models/editorRegistry.js').EditorContext} ctx */
export function lspExtension(ctx) {
  const languageId = lspLanguageId(ctx.path);

  if (!languageId) return null;

  return [
    docSyncPlugin(ctx, languageId),
    hoverExtension(ctx, languageId),
    completionExtension(ctx, languageId),
    navigationExtension(ctx, languageId),
    lintGutter(),
  ];
}

registerEditorExtension(lspExtension);
