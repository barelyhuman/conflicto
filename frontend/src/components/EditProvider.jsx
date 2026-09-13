import { EditProvider as PierreEditProvider } from '@pierre/diffs/react';

/**
 * Wraps children with @pierre/diffs edit capability.
 *
 * @param {Object} props
 * @param {import('preact').ComponentChildren} props.children
 */
export function EditProvider({ children }) {
  return (
    <PierreEditProvider>
      {children}
    </PierreEditProvider>
  );
}
