import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { IconSearch } from '@tabler/icons-preact';
import { AnchoredMenu } from './AnchoredMenu.jsx';
import { Highlighted } from './Highlighted.jsx';
import { escapeStep, initialActive, keyAction, moveActive, rankItems } from './searchableMenu.js';
import './SearchableMenu.css';

let menuSeq = 0;

/**
 * Menu body. Mounted only while the menu is open, so query / active reset on every open.
 */
function SearchableMenuBody({
  items,
  onSelect,
  onClose,
  placeholder,
  emptyText,
  mono,
  renderIcon,
  renderBadges,
  renderAction,
  footer,
  label,
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const idBase = useRef(`sm-${++menuSeq}`).current;

  const results = useMemo(() => rankItems(items, query), [items, query]);
  const [active, setActive] = useState(() => initialActive(rankItems(items, ''), ''));

  function updateQuery(next) {
    setQuery(next);
    setActive(initialActive(rankItems(items, next), next));
  }

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const activeId = active >= 0 && active < results.length ? `${idBase}-${active}` : undefined;

  useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector(`[id="${activeId}"]`);

    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  function pick(item) {
    if (item.disabled) return;
    onSelect?.(item);
    onClose?.();
  }

  function onKeyDown(e) {
    const action = keyAction(e);

    if (!action) return;
    e.preventDefault();

    if (action === 'next' || action === 'prev') {
      setActive(moveActive(active, action === 'next' ? 1 : -1, results.length));
    } else if (action === 'select') {
      const r = results[active];

      if (r) pick(r.item);
    } else if (action === 'escape') {
      // Stop here so AnchoredMenu's document-level Escape does not close on the first press.
      e.stopPropagation();

      if (escapeStep(query) === 'clear') updateQuery('');
      else onClose?.();
    }
  }

  let lastGroup;

  return (
    <>
      <div class="sm-input-row">
        <IconSearch size={13} stroke={1.75} />
        <input
          ref={inputRef}
          class="sm-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${idBase}-list`}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label={label || placeholder}
          placeholder={placeholder}
          spellcheck={false}
          autocomplete="off"
          value={query}
          onInput={(e) => updateQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <div ref={listRef} id={`${idBase}-list`} class="sm-list" role="listbox" aria-label={label}>
        {results.length === 0 && <div class="sm-empty">{emptyText}</div>}
        {results.map((r) => {
          const { item, indices, subIndices, pos } = r;
          const header = item.group != null && item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const isActive = pos === active;

          return (
            <Fragment key={item.id}>
              {header && <div class="sm-group-label" role="presentation">{header}</div>}
              <div
                id={`${idBase}-${pos}`}
                role="option"
                aria-selected={isActive ? 'true' : 'false'}
                aria-disabled={item.disabled ? 'true' : undefined}
                class={`sm-item${isActive ? ' active' : ''}${item.current ? ' current' : ''}${item.disabled ? ' disabled' : ''}${mono ? ' mono' : ''}`}
                title={item.title ?? item.sublabel ?? item.label}
                onMouseMove={() => active !== pos && setActive(pos)}
                onClick={() => pick(item)}
              >
                {renderIcon?.(item)}
                <span class="sm-text">
                  <span class="sm-line">
                    <span class="sm-label"><Highlighted text={item.label} indices={indices} /></span>
                    {renderBadges?.(item)}
                  </span>
                  {item.sublabel && (
                    <span class="sm-sub"><Highlighted text={item.sublabel} indices={subIndices} /></span>
                  )}
                </span>
                {renderAction?.(item, { close: onClose })}
              </div>
            </Fragment>
          );
        })}
      </div>

      {footer && <div class="sm-footer">{footer}</div>}
    </>
  );
}

/**
 * Anchored dropdown with an autofocused fuzzy-search field (palette-style keys:
 * Up/Down, Ctrl+N/P, Enter; Esc clears the query, then closes).
 *
 * Items: `{ id, label, sublabel?, keywords?, group?, current?, disabled? }`; see searchableMenu.js.
 * Disabled items stay visible and searchable (so their actions work) but cannot be picked.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import('preact').RefObject<HTMLElement|null>} props.anchorRef
 * @param {Array<{ id: string, label: string, sublabel?: string, keywords?: string[], group?: string, current?: boolean }>} props.items
 * @param {(item: any) => void} props.onSelect
 * @param {string} [props.placeholder]
 * @param {string} [props.emptyText]
 * @param {string} [props.className]
 * @param {number} [props.offset]
 * @param {boolean} [props.mono] monospace labels (branches)
 * @param {(item: any) => import('preact').ComponentChildren} [props.renderIcon]
 * @param {(item: any) => import('preact').ComponentChildren} [props.renderBadges] inline after the label (never truncated)
 * @param {(item: any, ctx: { close: () => void }) => import('preact').ComponentChildren} [props.renderAction] trailing control
 * @param {import('preact').ComponentChildren} [props.footer] pinned below the list, unaffected by the filter
 * @param {string} [props.label] accessible name for the combobox and list
 */
export function SearchableMenu({
  open,
  onClose,
  anchorRef,
  className = '',
  offset = 4,
  placeholder = 'Search…',
  emptyText = 'No matches',
  ...body
}) {
  return (
    <AnchoredMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom"
      alignment="start"
      offset={offset}
      role={null}
      className={`searchable-menu ${className}`.trim()}
    >
      <SearchableMenuBody onClose={onClose} placeholder={placeholder} emptyText={emptyText} {...body} />
    </AnchoredMenu>
  );
}
