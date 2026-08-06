import { useRef, useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Minimal virtual list. Renders only visible rows + overscan buffer.
 *
 * @param {Object} props
 * @param {any[]} props.items
 * @param {number} props.itemHeight
 * @param {number} [props.overscan=3]
 * @param {() => void} [props.onScrollEnd]
 * @param {string} [props.className]
 * @param {(item: any, index: number) => import('preact').VNode} props.renderItem
 */
export function VirtualList({ items, itemHeight, overscan = 3, onScrollEnd, className, renderItem }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  const measure = useCallback(() => {
    if (ref.current) {
      setHeight(ref.current.clientHeight);
    }
  }, []);

  useEffect(() => {
    measure();
    let ro = null;
    const el = ref.current;
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      if (ro && el) ro.unobserve(el);
    };
  }, [measure]);

  const handleScroll = useCallback(
    (e) => {
      const el = e.target;
      setScrollTop(el.scrollTop);
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
        onScrollEnd?.();
      }
    },
    [onScrollEnd]
  );

  const totalHeight = items.length * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / itemHeight) + overscan);
  const topHeight = start * itemHeight;
  const bottomHeight = (items.length - end) * itemHeight;

  return (
    <div ref={ref} class={className} onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ height: topHeight }} />
        {items.slice(start, end).map((item, i) => (
          <div key={item.number ?? item.id ?? `item-${start + i}`} style={{ height: itemHeight }}>
            {renderItem(item, start + i)}
          </div>
        ))}
        <div style={{ height: bottomHeight }} />
      </div>
    </div>
  );
}
