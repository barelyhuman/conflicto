import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { api } from '../../wails.js';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { tabsStore } from '../../models/tabs.js';
import {
  consumePendingReveal,
  getView,
  notifyFileSaved,
  registerView,
  revealInView,
} from '../../models/editorRegistry.js';
import { LspStatusPill } from './LspStatusPill.jsx';
import { lspLanguageId } from '../../lsp/languageId.js';
import './tabs.css';

async function readFile(path) {
  const res = await api.getFileContents(path, false);

  if (!res?.hasNew) throw new Error('This file is missing, too large, or not UTF-8 text, so it cannot be opened.');

  return res.newContent;
}

/**
 * Editable CodeMirror view for a `file` tab. The EditorView lives in the
 * editor registry, not in this component: switching tabs only re-parents the
 * view's DOM, so cursor, scroll, undo history and unsaved edits survive.
 *
 * @param {Object} props
 * @param {string} props.tabId
 * @param {string} props.path
 * @param {string | null} props.scope worktree path the tab belongs to
 * @param {(title: string, message: string) => void} [props.onError]
 */
export function FileTabEditor({ tabId, path, scope, onError }) {
  const host = useRef(/** @type {HTMLDivElement | null} */ (null));
  const status = useSignal(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
  const message = useSignal('');
  const { themeType } = useTheme();
  const darkRef = useRef(themeType === 'dark');
  darkRef.current = themeType === 'dark';
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const hostEl = host.current;
    /** @type {any} */
    let view = null;
    const ctx = { path, tabId, scope };
    status.value = 'loading';

    async function save() {
      const handle = view && (await import('./cm/createEditor.js')).getHandle(view);

      // Saving an unmodified buffer would clobber newer on-disk content with a stale copy.
      if (!handle?.isDirty()) return;
      const written = handle.view.state.doc;
      const text = handle.getText();

      try {
        await api.writeFile(path, text);
        handle.markSaved(written);
        notifyFileSaved(ctx);
      } catch (err) {
        onErrorRef.current?.('Save Error', err?.message ?? String(err));
      }
    }

    async function mount() {
      try {
        view = getView(tabId, scope);

        if (!view) {
          const text = await readFile(path);
          const mod = await import('./cm/createEditor.js');

          if (cancelled) return;
          // Another mount may have created it while we awaited.
          view = getView(tabId, scope);

          if (!view) {
            const handle = await mod.createFileEditor({
              text,
              path,
              ctx,
              dark: darkRef.current,
              onDirtyChange: (dirty) => tabsStore.setDirty(tabId, dirty),
              onSave: save,
            });

            if (cancelled) {
              handle.view.destroy();

              return;
            }

            view = handle.view;
            registerView(ctx, view);
          }
        } else {
          // Re-activated: pick up edits made on disk meanwhile (terminal, git) unless dirty.
          const mod = await import('./cm/createEditor.js');
          const handle = mod.getHandle(view);

          if (handle && !handle.isDirty()) {
            const text = await readFile(path).catch(() => null);

            if (text != null && !cancelled) handle.reloadFromDisk(text);
          }
        }

        if (cancelled || !host.current) return;
        host.current.appendChild(view.dom);
        status.value = 'ready';
        view.requestMeasure();
        const pending = consumePendingReveal(ctx);

        if (pending) revealInView(view, pending.line, pending.col);
        view.focus();
      } catch (err) {
        if (cancelled) return;
        message.value = err?.message ?? 'Failed to open file';
        status.value = 'error';
      }
    }

    mount();

    return () => {
      cancelled = true;

      if (view && view.dom.parentNode === hostEl) view.dom.remove();
    };
    // status/message are stable signals.
  }, [tabId, path, scope, status, message]);

  // Follow the app theme (light/dark flag for CodeMirror's built-in defaults).
  useEffect(() => {
    const view = getView(tabId, scope);

    if (!view) return;
    import('./cm/createEditor.js').then((m) => m.getHandle(view)?.setDark(themeType === 'dark'));
  }, [themeType, tabId, scope]);

  return (
    <div class="file-tab-editor">
      <Show when={() => status.value === 'loading'}>
        <div class="file-tab-status" aria-busy="true">Loading file…</div>
      </Show>
      <Show when={() => status.value === 'error'}>
        <div class="file-tab-status">{message}</div>
      </Show>
      <div class="file-tab-host" ref={host} />
      {lspLanguageId(path) ? <LspStatusPill path={path} /> : null}
    </div>
  );
}
