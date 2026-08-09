import { createPortal } from 'preact/compat';
import { useRef, useLayoutEffect, useEffect } from 'preact/hooks';
import { createPopper } from '@preachjs/popper';

const VIEWPORT_PAD = 8;

/**
 * Portaled anchored menu that escapes sidebar overflow / frost stacking.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import('preact').RefObject<HTMLElement|null>} props.anchorRef
 * @param {'bottom'|'top'} [props.placement='bottom']
 * @param {'start'|'end'|'center'} [props.alignment='start']
 * @param {number} [props.offset=4]
 * @param {string} [props.className]
 * @param {import('preact').Ref<HTMLElement|null>} [props.menuRef]
 * @param {import('preact').ComponentChildren} props.children
 */
export function AnchoredMenu({
  open,
  onClose,
  anchorRef,
  placement = 'bottom',
  alignment = 'start',
  offset = 4,
  className = '',
  menuRef: menuRefProp,
  children,
}) {
  const localMenuRef = useRef(null);

  function setMenuRef(node) {
    localMenuRef.current = node;
    if (typeof menuRefProp === 'function') {
      menuRefProp(node);
    } else if (menuRefProp) {
      menuRefProp.current = node;
    }
  }

  useLayoutEffect(() => {
    if (!open) return;

    const anchor = anchorRef.current;
    const menu = localMenuRef.current;
    if (!anchor || !menu) return;

    function position() {
      const a = anchorRef.current;
      const m = localMenuRef.current;
      if (!a || !m) return;

      m.style.position = 'fixed';
      m.style.top = '0px';
      m.style.left = '0px';
      m.style.maxHeight = '';
      m.style.visibility = 'hidden';

      const preferred = placement;
      const popper = createPopper(a, m);
      popper.move(preferred, alignment).offset(offset);
      popper.align();
      m.style.position = 'fixed';

      const anchorBox = a.getBoundingClientRect();
      const menuBox = m.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const availBelow = vh - VIEWPORT_PAD - (anchorBox.bottom + offset);
      const availAbove = anchorBox.top - offset - VIEWPORT_PAD;

      let pos = preferred;
      if (preferred === 'bottom' && menuBox.height > availBelow && availAbove > availBelow) {
        pos = 'top';
      } else if (preferred === 'top' && menuBox.height > availAbove && availBelow > availAbove) {
        pos = 'bottom';
      }

      if (pos !== preferred) {
        popper.move(pos, alignment).offset(offset);
        popper.align();
        m.style.position = 'fixed';
      }

      const space =
        pos === 'bottom'
          ? vh - VIEWPORT_PAD - (anchorBox.bottom + offset)
          : anchorBox.top - offset - VIEWPORT_PAD;
      m.style.maxHeight = `${Math.max(120, space)}px`;

      popper.move(pos, alignment).offset(offset);
      popper.align();
      m.style.position = 'fixed';

      let top = parseFloat(m.style.top) || 0;
      let left = parseFloat(m.style.left) || 0;
      const width = m.offsetWidth;
      const height = m.offsetHeight;

      left = Math.min(Math.max(VIEWPORT_PAD, left), Math.max(VIEWPORT_PAD, vw - VIEWPORT_PAD - width));
      top = Math.min(Math.max(VIEWPORT_PAD, top), Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - height));

      m.style.top = `${top}px`;
      m.style.left = `${left}px`;
      m.style.visibility = '';
    }

    let raf = 0;
    let positioning = false;
    function schedulePosition() {
      if (positioning) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        positioning = true;
        try {
          position();
        } finally {
          positioning = false;
        }
      });
    }

    position();

    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedulePosition) : null;
    ro?.observe(menu);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      ro?.disconnect();
    };
  }, [open, anchorRef, placement, alignment, offset]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e) {
      const a = anchorRef.current;
      const m = localMenuRef.current;
      const t = /** @type {Node} */ (e.target);
      if (a?.contains(t) || m?.contains(t)) return;
      onClose?.();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const classes = ['anchored-menu', className].filter(Boolean).join(' ');

  return createPortal(
    <div ref={setMenuRef} class={classes} role="listbox">
      {children}
      <style>{`
        .anchored-menu {
          position: fixed;
          z-index: 900;
          box-sizing: border-box;
          background: var(--card-bg);
          border: 1px solid var(--light-grey);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
          overflow-x: hidden;
          overflow-y: auto;
        }
      `}</style>
    </div>,
    document.body
  );
}
