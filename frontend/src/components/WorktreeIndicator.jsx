import { useState } from 'preact/hooks';
import { IconFolderSymlink } from '@tabler/icons-preact';

/**
 * @param {Object} props
 * @param {string|null} props.path
 */
export function WorktreeIndicator({ path }) {
  const [hovered, setHovered] = useState(false);

  if (!path) return null;

  return (
    <div
      class="worktree-indicator"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <IconFolderSymlink size={14} />

      {hovered && (
        <div class="worktree-tooltip">
          <div class="worktree-label">Worktree</div>
          <div class="worktree-path">{path}</div>
        </div>
      )}

      <style>{`
        .worktree-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: var(--text-muted);
          cursor: help;
          position: relative;
          transition: color 0.15s, background 0.15s;
        }
        .worktree-indicator:hover {
          color: var(--text);
          background: var(--accent-hover);
        }
        .worktree-tooltip {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 100;
          min-width: 240px;
          pointer-events: none;
        }
        .worktree-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .worktree-path {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text);
          word-break: break-all;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
