import {
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-preact';

/**
 * Expand/collapse toggle for diff viewers.
 *
 * @param {Object} props
 * @param {boolean} props.expanded
 * @param {() => void} props.onToggle
 * @param {string} [props.className]
 */
export function DiffExpandToggle({ expanded, onToggle, className = '' }) {
  const cls = ['diff-expand-toggle', className].filter(Boolean).join(' ');

  const offset = 5;

  const chevUpRef = (node) => {
    if (!node) return
    if (!expanded) {
      node.base.setAttribute("viewBox", `0 ${-offset} 24 24`);
    } else {
      node.base.setAttribute("viewBox", `0 ${offset} 24 24`);
    }
  }

  const chevDownRef = (node) => {
    if (!node) return
    if (!expanded) {
      node.base.setAttribute("viewBox", `0 ${offset} 24 24`);
    } else {
      node.base.setAttribute("viewBox", `0 ${-offset} 24 24`);
    }
  }

  return (
    <button
      type="button"
      class={cls}
      onClick={onToggle}
      title={expanded ? 'Collapse all' : 'Expand all'}
      aria-label={expanded ? 'Collapse all' : 'Expand all'}
    >
      <span class={`diff-expand-icons${expanded ? ' expanded' : ''}`}>
        <IconChevronUp ref={chevUpRef} size={12} stroke={1.75} />
        <IconChevronDown ref={chevDownRef} size={12} stroke={1.75} />
      </span>
    </button>
  );
}
