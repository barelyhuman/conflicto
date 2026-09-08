import { useRef, useState } from 'preact/hooks';
import { IconChevronDown, IconCopy } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';
import { api } from '../wails.js';

/**
 * Copy a file path to the clipboard, with absolute or relative options.
 * Clicking the copy icon copies the relative path; the chevron opens a menu.
 *
 * @param {Object} props
 * @param {string} props.absolutePath
 * @param {string} props.relativePath
 * @param {string} [props.className]
 */
export function CopyPathButton({ absolutePath, relativePath, className = '' }) {
  const [open, setOpen] = useState(false);
  const groupRef = useRef(null);
  const menuAnchorRef = useRef(null);
  const timerRef = useRef(null);

  const cls = ['copy-path-button', className].filter(Boolean).join(' ');

  async function copyPath(path, label) {
    const copied = await api.copyToClipboard(path);
    if (!copied || !groupRef.current) return;

    setOpen(false);
    groupRef.current.title = `Copied ${label}`;
    groupRef.current.setAttribute('aria-label', `Copied ${label}`);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!groupRef.current) return;
      groupRef.current.title = 'Copy relative path';
      groupRef.current.setAttribute('aria-label', 'Copy relative path');
    }, 2000);
  }

  return (
    <div
      ref={groupRef}
      class="copy-path-picker"
      title="Copy relative path"
      aria-label="Copy relative path"
    >
      <div class={cls}>
        <button
          type="button"
          class="copy-path-main"
          onClick={() => copyPath(relativePath, 'relative path')}
          title="Copy relative path"
          aria-label="Copy relative path"
        >
          <IconCopy size={13} stroke={1.75} />
        </button>
        <button
          ref={menuAnchorRef}
          type="button"
          class="copy-path-menu-trigger"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title="Copy path options"
          aria-label="Copy path options"
        >
          <IconChevronDown size={10} class={open ? 'open' : ''} stroke={2} />
        </button>
      </div>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={menuAnchorRef}
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
          height: 22px;
          display: inline-flex;
          align-items: center;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: var(--grey);
          padding: 0;
          margin-left: 2px;
          flex-shrink: 0;
          --wails-draggable: no-drag;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .copy-path-button:hover {
          background: rgba(127, 127, 127, 0.14);
          color: var(--text);
        }
        .copy-path-main,
        .copy-path-menu-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 0;
          --wails-draggable: no-drag;
        }
        .copy-path-main {
          width: 18px;
          height: 22px;
        }
        .copy-path-menu-trigger {
          width: 14px;
          height: 22px;
        }
        .copy-path-main svg,
        .copy-path-menu-trigger svg {
          flex-shrink: 0;
        }
        .copy-path-menu-trigger svg.open {
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
