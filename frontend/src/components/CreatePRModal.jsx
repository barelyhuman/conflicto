import { useState } from 'preact/hooks';

/**
 * Modal for creating a new pull request.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string[]} props.baseBranches
 * @param {(title: string, body: string, baseBranch: string, draft: boolean) => void} props.onSubmit
 */
export function CreatePRModal({ open, onClose, baseBranches, onSubmit }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState(baseBranches[0] ?? 'main');
  const [draft, setDraft] = useState(false);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit?.(title.trim(), body.trim(), baseBranch, draft);
    setTitle('');
    setBody('');
    setDraft(false);
  }

  return (
    <div class="create-pr-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="create-pr-window">
        <div class="create-pr-header">
          <span class="create-pr-title">Create Pull Request</span>
          <button type="button" class="create-pr-close" onClick={onClose}>×</button>
        </div>
        <form class="create-pr-form" onSubmit={handleSubmit}>
          <label class="create-pr-label">
            Title
            <input
              class="create-pr-input"
              type="text"
              value={title}
              onInput={(e) => setTitle(e.target.value)}
              placeholder="Short summary of changes"
              required
            />
          </label>

          <label class="create-pr-label">
            Base branch
            <select
              class="create-pr-select"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
            >
              {baseBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>

          <label class="create-pr-label">
            Body
            <textarea
              class="create-pr-textarea"
              value={body}
              onInput={(e) => setBody(e.target.value)}
              placeholder="Describe the changes..."
              rows={5}
            />
          </label>

          <label class="create-pr-check">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            Create as draft
          </label>

          <div class="create-pr-actions">
            <button type="submit" class="create-pr-btn create-pr-btn-primary" disabled={!title.trim()}>
              Create PR
            </button>
            <button type="button" class="create-pr-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
      <style>{`
        .create-pr-overlay {
          position: fixed;
          inset: 0;
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
        }
        .create-pr-window {
          width: 520px;
          max-width: 90vw;
          background: var(--surface-raised);
          border-radius: 10px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .create-pr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          flex-shrink: 0;
        }
        .create-pr-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-h);
          font-family: var(--font-sans);
        }
        .create-pr-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .create-pr-close:hover {
          background: var(--accent-hover);
          color: var(--text);
        }
        .create-pr-form {
          padding: 0 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .create-pr-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          font-family: var(--font-sans);
        }
        .create-pr-input,
        .create-pr-select,
        .create-pr-textarea {
          padding: 6px 8px;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 13px;
          outline: none;
        }
        .create-pr-input:focus,
        .create-pr-select:focus,
        .create-pr-textarea:focus {
          border-color: var(--accent-hover);
        }
        .create-pr-textarea {
          resize: vertical;
        }
        .create-pr-check {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text);
          font-family: var(--font-sans);
        }
        .create-pr-check input {
          margin: 0;
        }
        .create-pr-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .create-pr-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .create-pr-btn:hover {
          background: var(--accent-hover);
          color: var(--text);
        }
        .create-pr-btn-primary {
          background: var(--accent-bg);
          color: var(--text-h);
          font-weight: 500;
        }
        .create-pr-btn-primary:hover {
          background: var(--accent-hover);
        }
        .create-pr-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
