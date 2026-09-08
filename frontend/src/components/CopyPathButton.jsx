import { useRef } from 'preact/hooks';
import { IconCopy } from '@tabler/icons-preact';
import { api } from '../wails.js';

/**
 * Copy a file path to the clipboard.
 *
 * @param {Object} props
 * @param {string} props.path
 * @param {string} [props.className]
 */
export function CopyPathButton({ path, className = '' }) {
  const timerRef = useRef(null);
  const btnRef = useRef(null);

  const cls = ['diff-expand-toggle', className].filter(Boolean).join(' ');

  async function handleCopy() {
    const copied = await api.copyToClipboard(path);
    if (!copied || !btnRef.current) return;

    btnRef.current.title = 'Copied!';
    btnRef.current.setAttribute('aria-label', 'Copied!');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!btnRef.current) return;
      btnRef.current.title = 'Copy path';
      btnRef.current.setAttribute('aria-label', 'Copy path');
    }, 2000);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      class={cls}
      onClick={handleCopy}
      title="Copy path"
      aria-label="Copy path"
    >
      <IconCopy size={13} stroke={1.75} />
    </button>
  );
}
