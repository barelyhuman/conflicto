import { useCallback } from 'preact/hooks';
import { EditProvider as PierreEditProvider } from '@pierre/diffs/react';
import { Editor } from '@pierre/diffs/edit';

/**
 * Wraps children with @pierre/diffs edit capability.
 *
 * @param {Object} props
 * @param {import('preact').ComponentChildren} props.children
 */
export function EditProvider({ children }) {
  const createEditor = useCallback((options) => new Editor(options), []);

  return (
    <PierreEditProvider createEditor={createEditor}>
      {children}
    </PierreEditProvider>
  );
}
