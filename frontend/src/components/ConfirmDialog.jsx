/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {string} props.filename
 * @param {string} [props.title]
 * @param {string} [props.message]
 * @param {string} [props.confirmLabel]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export function ConfirmDialog({
  open,
  filename,
  title = 'Stage conflicted file?',
  message = null,
  confirmLabel = 'Stage with markers',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const body = message ?? (
    <>
      <code>{filename}</code> contains unresolved merge markers.
      Are you sure you want to stage it with the conflict markers included?
    </>
  );

  return (
    <div class="confirm-overlay">
      <div class="confirm-dialog">
        <div class="confirm-title">{title}</div>
        <p class="confirm-message">{body}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="confirm-btn confirm-btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        .confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .confirm-dialog {
          background: var(--surface-raised);
          border: none;
          border-radius: 10px;
          padding: 20px 24px;
          max-width: 360px;
          width: 90%;
          box-shadow: 0 16px 48px rgba(0,0,0,0.4);
        }
        .confirm-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-h);
          margin-bottom: 10px;
        }
        .confirm-message {
          font-size: 13px;
          color: var(--text);
          line-height: 1.5;
          margin: 0 0 16px;
        }
        .confirm-message code {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-h);
          background: var(--accent-bg);
          padding: 1px 4px;
          border-radius: 3px;
        }
        .confirm-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .confirm-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          font-family: var(--font-sans);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .confirm-btn-secondary {
          background: transparent;
          color: var(--text);
        }
        .confirm-btn-secondary:hover {
          background: var(--accent-hover);
        }
        .confirm-btn-primary {
          background: var(--text-h);
          color: var(--bg);
          border-color: var(--text-h);
        }
        .confirm-btn-primary:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
