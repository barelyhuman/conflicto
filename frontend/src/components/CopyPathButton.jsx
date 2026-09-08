import { useRef, useState } from 'preact/hooks';
import { IconChevronDown, IconCopy } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';
import { api } from '../wails.js';

/**
 * Copy a file path to the clipboard, with absolute or relative options.
 *
 * @param {Object} props
 * @param {string} props.absolutePath
 * @param {string} props.relativePath
 * @param {string} [props.className]
 */
export function CopyPathButton({ absolutePath, relativePath, className = '' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const timerRef = useRef(null);

  const cls = ['copy-path-button', className].filter(Boolean).join(' ');

  async function copyPath(path, label) {
    const copied = await api.copyToClipboard(path);
    if (!copied || !triggerRef.current) return;

    setOpen(false);
    triggerRef.current.title = `Copied ${label}`;
    triggerRef.current.setAttribute('aria-label', `Copied ${label}`);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return;
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
        <IconCopy size={13} stroke={1.75} />
        <IconChevronDown size={10} class={open ? 'open' : ''} stroke={2} />
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
          onClick={() => copyPath(absolutePath, 'absolute path')}
        >
          <span class="copy-path-option-label">Absolute path</span>
          <span class="copy-path-option-value">{absolutePath}</span>
        </button>
        <button
          type="button"
          class="copy-path-option"
          onClick={() => copyPath(relativePath, 'relative path')}
        >
          <span class="copy-path-option-label">Relative path</span>
          <span class="copy-path-option-value">{relativePath}</span>
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
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 1px;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: var(--grey);
          cursor: pointer;
          padding: 0 3px;
          margin-left: 2px;
          flex-shrink: 0;
          --wails-draggable: no-drag;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .copy-path-button:hover {
          background: rgba(127, 127, 127, 0.14);
          color: var(--text);
        }
        .copy-path-button svg {
          flex-shrink: 0;
        }
        .copy-path-button svg.open {
          transform: rotate(180deg);
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
