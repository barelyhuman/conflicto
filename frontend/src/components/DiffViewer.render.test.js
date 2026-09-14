/**
 * @vitest-environment happy-dom
 *
 * Client-side Pierre FileDiff render (same options DiffViewer uses).
 * Asserts patches paint into the shadow root after async highlight.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileDiff, registerCustomTheme } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { createAppShikiTheme } from '../theme/adapter.js';
import { fileDiffFromPatch } from './pierreDiffOptions.js';

/** Fixture: unstaged main.jsx with a single deleted import line (0+/1-). */
const MAIN_JSX_REMOVAL_ONLY_PATCH = `diff --git a/frontend/src/main.jsx b/frontend/src/main.jsx
index 057e8ec..26b0467 100644
--- a/frontend/src/main.jsx
+++ b/frontend/src/main.jsx
@@ -1,4 +1,3 @@
-import './console-bridge.js'
 import { render } from 'preact'
 import './index.css'
 import { App } from './app.jsx'
`;

/** Fixture: single-line addition in package.json (1+/0-), mid-file context. */
const PACKAGE_JSON_SINGLE_ADDITION_PATCH = `diff --git a/frontend/package.json b/frontend/package.json
index 0b59b92..e9daa78 100644
--- a/frontend/package.json
+++ b/frontend/package.json
@@ -28,6 +28,7 @@
     "eslint-plugin-react": "^7.37.5",
     "eslint-plugin-react-hooks": "^7.1.1",
     "globals": "^17.9.0",
+    "happy-dom": "^20.14.5",
     "vite": "^8.2.0",
     "vitest": "^4.1.10"
   },
`;

/** Fixture: addition-only hunk at file start (no deletions in the change block). */
const ADDITION_ONLY_PATCH = `diff --git a/frontend/src/main.jsx b/frontend/src/main.jsx
index 057e8ec..26b0467 100644
--- a/frontend/src/main.jsx
+++ b/frontend/src/main.jsx
@@ -1,3 +1,4 @@
+import './console-bridge.js'
 import { render } from 'preact'
 import './index.css'
 import { App } from './app.jsx'
`;

/** Fixture: brand-new file (Pierre type "new", additions only). */
const NEW_FILE_PATCH = `diff --git a/frontend/src/components/DiffViewer.render.test.js b/frontend/src/components/DiffViewer.render.test.js
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/frontend/src/components/DiffViewer.render.test.js
@@ -0,0 +1,5 @@
+/**
+ * @vitest-environment happy-dom
+ */
+import { describe } from 'vitest';
+describe('render', () => {});
`;

/** Fixture: DiffViewer.jsx-style edits that are net-addition heavy (import + helper). */
const DIFFVIEWER_ADDITIONS_PATCH = `diff --git a/frontend/src/components/DiffViewer.jsx b/frontend/src/components/DiffViewer.jsx
index aaaaaaa..bbbbbbb 100644
--- a/frontend/src/components/DiffViewer.jsx
+++ b/frontend/src/components/DiffViewer.jsx
@@ -1,6 +1,7 @@
 import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'preact/hooks';
 import { FileDiff } from '@pierre/diffs/react';
 import { IconExternalLink } from '@tabler/icons-preact';
+import { BrowserOpenURL } from '../wailsjs/runtime/runtime.js';
 import { useTheme } from '../theme/ThemeProvider.jsx';
 import { api } from '../wails.js';
 import { buildPRLineAnnotations } from './prLineAnnotations.js';
@@ -8,6 +9,8 @@ import { buildPRLineAnnotations } from './prLineAnnotations.js';
 import {
   annotationUnsafeCSS,
   expandUnchangedForDiff,
+  fileDiffFromPatch,
+  mapFileContentsToDiffFiles,
   loadDiffFilesForDiff,
 } from './pierreDiffOptions.js';
`;

const DELETED_FILE_PATCH = `diff --git a/frontend/src/console-bridge.js b/frontend/src/console-bridge.js
deleted file mode 100644
index 939a0ac..0000000
--- a/frontend/src/console-bridge.js
+++ /dev/null
@@ -1,3 +0,0 @@
-import { LogPrint } from './wailsjs/runtime/runtime.js';
-console.log('bridge');
-export {};
`;

/** Live unstaged ThemeProvider.jsx change (theme register moved to adapter load). */
const THEME_PROVIDER_PATCH = `diff --git a/frontend/src/theme/ThemeProvider.jsx b/frontend/src/theme/ThemeProvider.jsx
index a26c065..62da151 100644
--- a/frontend/src/theme/ThemeProvider.jsx
+++ b/frontend/src/theme/ThemeProvider.jsx
@@ -1,5 +1,5 @@
 import { useState, useEffect, createContext, useContext } from 'preact/compat';
-import { registerAppTheme, resolveThemeMode } from './adapter.js';
+import { resolveThemeMode } from './adapter.js';
 
 const ThemeContext = createContext(null);
 
@@ -11,8 +11,6 @@ export function ThemeProvider({ children }) {
   const [themeType, setThemeType] = useState(() => resolveThemeMode());
 
   useEffect(() => {
-    registerAppTheme();
-
     const mq = window.matchMedia('(prefers-color-scheme: dark)');
     const onChange = () => setThemeType(resolveThemeMode());
     mq.addEventListener('change', onChange);
`;

/** Mirrors DiffViewer FileDiff options (minus loadDiffFiles). */
function diffViewerOptions(overrides = {}) {
  return {
    theme: { dark: 'conflicto-dark', light: 'conflicto-light' },
    themeType: 'dark',
    diffStyle: 'unified',
    overflow: 'wrap',
    disableFileHeader: true,
    collapsedContextThreshold: 1,
    disableWorkerPool: true,
    disableErrorHandling: true,
    ...overrides,
  };
}

/**
 * Render a patch with vanilla FileDiff and wait until shadow DOM has a <pre>
 * (first sync paint often returns false while highlight initializes).
 * @param {string} patch
 * @param {{ timeoutMs?: number, options?: Record<string, unknown> }} [opts]
 */
export async function renderPatchToShadow(patch, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const fileDiff = fileDiffFromPatch(patch);
  if (fileDiff == null) {
    throw new Error('fileDiffFromPatch returned null — DiffViewer would show empty state');
  }

  const host = document.createElement('div');
  document.body.appendChild(host);

  const instance = new FileDiff(diffViewerOptions(opts.options));

  const painted = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `FileDiff did not paint within ${timeoutMs}ms (shadowLen=${host.shadowRoot?.innerHTML?.length ?? 0})`
        )
      );
    }, timeoutMs);

    instance.setOptions({
      ...instance.options,
      onPostRender: () => {
        const html = host.shadowRoot?.innerHTML ?? '';
        if (html.includes('<pre')) {
          clearTimeout(timer);
          resolve(html);
        }
      },
    });

    try {
      instance.render({ fileDiff, fileContainer: host });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });

  const shadowHtml = await painted;
  return { host, instance, fileDiff, shadowHtml };
}

function registerThemes() {
  registerCustomTheme('conflicto-dark', () => Promise.resolve(createAppShikiTheme('dark')));
  registerCustomTheme('conflicto-light', () => Promise.resolve(createAppShikiTheme('light')));
}

describe('DiffViewer Pierre renderer', () => {
  beforeEach(() => {
    registerThemes();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('removal-only', () => {
    it('parses the main.jsx removal-only patch the same way DiffViewer does', () => {
      const meta = fileDiffFromPatch(MAIN_JSX_REMOVAL_ONLY_PATCH);
      expect(meta).not.toBeNull();
      expect(meta.type).toBe('change');
      expect(meta.hunks.length).toBeGreaterThan(0);
      expect(meta.deletionLines.some((l) => l.includes('console-bridge'))).toBe(true);
    });

    it('paints removal-only main.jsx into the shadow root (deleted line + context)', async () => {
      const { shadowHtml } = await renderPatchToShadow(MAIN_JSX_REMOVAL_ONLY_PATCH);
      expect(shadowHtml).toContain('console-bridge');
      expect(shadowHtml).toContain('preact');
      expect(shadowHtml).toMatch(/data-line-type="change-deletion"/);
    });

    it('paints fully deleted files', async () => {
      const meta = fileDiffFromPatch(DELETED_FILE_PATCH);
      expect(meta?.type).toBe('deleted');
      const { shadowHtml } = await renderPatchToShadow(DELETED_FILE_PATCH);
      expect(shadowHtml).toContain('LogPrint');
      expect(shadowHtml).toContain('bridge');
    });
  });

  describe('addition-only', () => {
    it('parses package.json single-line addition', () => {
      const meta = fileDiffFromPatch(PACKAGE_JSON_SINGLE_ADDITION_PATCH);
      expect(meta).not.toBeNull();
      expect(meta.type).toBe('change');
      expect(meta.hunks[0].hunkContent.some((c) => c.type === 'change' && c.additions === 1 && c.deletions === 0)).toBe(
        true
      );
    });

    it('paints package.json single-line addition (happy-dom) into the shadow root', async () => {
      const { shadowHtml } = await renderPatchToShadow(PACKAGE_JSON_SINGLE_ADDITION_PATCH);
      expect(shadowHtml).toContain('happy-dom');
      expect(shadowHtml).toContain('globals');
      expect(shadowHtml).toMatch(/data-line-type="change-addition"/);
    });

    it('paints addition-only hunks at file start', async () => {
      const { shadowHtml } = await renderPatchToShadow(ADDITION_ONLY_PATCH);
      expect(shadowHtml).toContain('console-bridge');
      expect(shadowHtml).toMatch(/data-line-type="change-addition"/);
    });

    it('paints DiffViewer.jsx-style addition hunks (new imports)', async () => {
      const meta = fileDiffFromPatch(DIFFVIEWER_ADDITIONS_PATCH);
      expect(meta).not.toBeNull();
      expect(meta.type).toBe('change');
      const { shadowHtml } = await renderPatchToShadow(DIFFVIEWER_ADDITIONS_PATCH);
      expect(shadowHtml).toContain('fileDiffFromPatch');
      expect(shadowHtml).toContain('mapFileContentsToDiffFiles');
      expect(shadowHtml).toMatch(/data-line-type="change-addition"/);
    });

    it('paints brand-new files (Pierre type new)', async () => {
      const meta = fileDiffFromPatch(NEW_FILE_PATCH);
      expect(meta?.type).toBe('new');
      const { shadowHtml } = await renderPatchToShadow(NEW_FILE_PATCH);
      expect(shadowHtml).toContain('@vitest-environment');
      expect(shadowHtml).toMatch(/data-line-type="change-addition"/);
    });

    it('paints ThemeProvider.jsx unstaged-style hunk', async () => {
      const meta = fileDiffFromPatch(THEME_PROVIDER_PATCH);
      expect(meta).not.toBeNull();
      expect(meta.type).toBe('change');
      const { shadowHtml } = await renderPatchToShadow(THEME_PROVIDER_PATCH);
      expect(shadowHtml).toContain('resolveThemeMode');
      expect(shadowHtml).toContain('matchMedia');
    });
  });

  describe('theme registration', () => {
    it('throws when DiffViewer theme names are not registered (useEffect race)', async () => {
      const fileDiff = fileDiffFromPatch(PACKAGE_JSON_SINGLE_ADDITION_PATCH);
      await expect(
        preloadFileDiff({
          fileDiff,
          options: {
            theme: { dark: 'conflicto-ghost-dark', light: 'conflicto-ghost-light' },
            themeType: 'dark',
            diffStyle: 'unified',
            disableFileHeader: true,
          },
        })
      ).rejects.toThrow(/No valid theme loader registered/);
    });
  });
});
