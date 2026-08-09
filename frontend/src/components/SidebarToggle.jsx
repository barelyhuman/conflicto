import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-preact';

/**
 * Sidebar collapse/expand control for the content island header.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {string} [props.className]
 */
export function SidebarToggle({ open, onToggle, className = '' }) {
  const cls = ['sidebar-toggle', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      class={cls}
      title={open ? 'Hide sidebar' : 'Show sidebar'}
      aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
      aria-pressed={open}
      onClick={onToggle}
    >
      {open ? (
        <IconLayoutSidebarLeftCollapse size={16} stroke={1.75} />
      ) : (
        <IconLayoutSidebarLeftExpand size={16} stroke={1.75} />
      )}
    </button>
  );
}
