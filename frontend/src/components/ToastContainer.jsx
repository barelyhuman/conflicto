import { ToastItem } from './ToastItem.jsx';

/**
 * @param {Object} props
 * @param {{ id: string, title: string, message: string }[]} props.toasts
 * @param {(id: string) => void} props.onDismiss
 */
export function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  // Only show last 5
  const visible = toasts.slice(-5);

  return (
    <div class="toast-container">
      {visible.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          title={t.title}
          message={t.message}
          onDismiss={onDismiss}
        />
      ))}
      <style>{`
        .toast-container {
          position: fixed;
          bottom: 40px;
          right: 16px;
          z-index: 600;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          pointer-events: none;
        }
        .toast-container > * {
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}
