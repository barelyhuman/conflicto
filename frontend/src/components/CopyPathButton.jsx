import { useRef, useState } from 'preact/hooks';
import { IconCheck, IconCopy } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';
import { api } from '../wails.js';

/**
 * Copy a file path to the clipboard via absolute/relative dropdown options.
 *
 * @param {Object} props
 * @param {string} props.absolutePath
 * @param {string} props.relativePath
 * @param {string} [props.className]
 */
export function CopyPathButton({ absolutePath, relativePath, className = '' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef(null);
  const timerRef = useRef(null);

  const cls = ['copy-path-button', copied ? 'copied' : '', className]
    .filter(Boolean)
    .join(' ');

  async function copyPath(path, label) {
    const copiedToClipboard = await api.copyToClipboard(path);
    if (!copiedToClipboard || !triggerRef.current) return;

    setOpen(false);
    setCopied(true);
    triggerRef.current.title = `Copied ${label}`;
    triggerRef.current.setAttribute('aria-label', `Copied ${label}`);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
      setCopied(false);
      triggerRef.current.title = 'Copy path';
      triggerRef.current.setAttribute('aria-label', 'Copy path');
    }, 2000);
  }

  return (
    <div class="copy-path-picker">
      <button
        ref={triggerRef}
        type="button"
        class={cls}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Copy path"
        aria-label="Copy path"
      >
        {copied ? (
          <IconCheck size={13} stroke={2} />
        ) : (
          <IconCopy size={13} stroke={1.75} />
        )}
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        alignment="start"
        offset={4}
        className="copy-path-dropdown"
      >
        <button
          type="button"
          class="copy-path-option"
          onClick={() => copyPath(relativePath, 'relative path')}
        >
          <span class="copy-path-option-label">Relative path</span>
          <span class="copy-path-option-value">{relativePath}</span>
        </button>
        <button
          type="button"
          class="copy-path-option"
          onClick={() => copyPath(absolutePath, 'absolute path')}
        >
          <span class="copy-path-option-label">Absolute path</span>
          <span class="copy-path-option-value">{absolutePath}</span>
        </button>
      </AnchoredMenu>

      <style>{`
        .copy-path-picker {
          position: relative;
          display: inline-flex;
          flex-shrink: 0;
          --wails-draggable: no-drag;
        }
        .copy-path-button {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: var(--grey);
          padding: 0;
          margin-left: 2px;
          flex-shrink: 0;
          cursor: pointer;
          --wails-draggable: no-drag;
          transition: background 0.12s ease, color 0.12s ease, transform 0.08s ease;
        }
        .copy-path-button:hover {
          background: rgba(127, 127, 127, 0.14);
          color: var(--text);
        }
        .copy-path-button:active {
          background: rgba(127, 127, 127, 0.24);
          color: var(--text);
          transform: scale(0.94);
        }
        .copy-path-button.copied {
          background: rgba(127, 127, 127, 0.14);
          color: var(--text);
        }
        .copy-path-button svg {
          flex-shrink: 0;
        }
        .anchored-menu.copy-path-dropdown {
          min-width: 240px;
          max-width: 360px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .copy-path-option {
          width: 100%;
          min-width: 0;
          text-align: left;
          padding: 6px 10px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          transition: background 0.1s;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .copy-path-option:hover {
          background: rgba(127, 127, 127, 0.12);
        }
        .copy-path-option-label {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 600;
          color: var(--text);
        }
        .copy-path-option-value {
          display: block;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--grey);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
