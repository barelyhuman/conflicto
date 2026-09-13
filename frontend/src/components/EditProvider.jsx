import { EditProvider as PierreEditProvider } from '@pierre/diffs/react';

/** No-op DiffsEditor — conflicto does not wire inline editing yet. */
function createNoopEditor() {
  return {
    __postponeBgTokenizeToNextFrame() {},
    __captureFocusForDOMReplacement() {},
    __syncRenderView() {},
    edit() {
      return () => {};
    },
    cleanUp() {},
  };
}

/**
 * Wraps children with @pierre/diffs edit capability.
 *
 * @param {Object} props
 * @param {import('preact').ComponentChildren} props.children
 */
export function EditProvider({ children }) {
  return (
    <PierreEditProvider createEditor={createNoopEditor}>
      {children}
    </PierreEditProvider>
  );
}
