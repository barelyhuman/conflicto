import { useEffect, useState } from 'preact/hooks';
import { IconX } from '@tabler/icons-preact';

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.title
 * @param {string} props.message
 * @param {(id: string) => void} props.onDismiss
 */
export function ToastItem({ id, title, message, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  function handleDismiss() {
    setVisible(false);
    setTimeout(() => onDismiss(id), 300);
  }

  return (
    <div
      class={`toast-item${visible ? ' toast-visible' : ''}${expanded ? ' toast-expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div class="toast-header">
        <span class="toast-title">{title}</span>
        <button type="button" class="toast-close" onClick={handleDismiss}>
          <IconX size={12} />
        </button>
      </div>
      <div class="toast-body">
        <span class="toast-message">{message}</span>
      </div>
      <style>{`
        .toast-item {
          width: 280px;
          background: var(--surface-raised);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transform: translateX(120%);
          opacity: 0;
          transition: transform 0.3s ease, opacity 0.3s ease, width 0.2s ease;
          cursor: default;
          overflow: hidden;
          border-left: 3px solid var(--removed);
          max-height: 56px;
        }
        .toast-item.toast-visible {
          transform: translateX(0);
          opacity: 1;
        }
        .toast-item.toast-expanded {
          max-height: 200px;
        }
        .toast-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .toast-title {
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-h);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .toast-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .toast-close:hover {
          background: var(--accent-hover);
          color: var(--text);
        }
        .toast-body {
          overflow: hidden;
        }
        .toast-message {
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1.5;
          color: var(--text-muted);
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: -webkit-line-clamp 0.2s ease;
        }
        .toast-expanded .toast-message {
          -webkit-line-clamp: 6;
        }
      `}</style>
    </div>
  );
}
