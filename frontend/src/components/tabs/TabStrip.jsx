import { useEffect, useRef } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { For } from '@preact/signals/utils';
import { IconX } from '@tabler/icons-preact';
import { splitPath } from '../ChangeTree.jsx';
import './tabs.css';

const MODE_LABEL = { staged: 'staged', conflict: 'conflict' };

/**
 * @param {Object} props
 * @param {import('../../models/tabs.js').Tab} props.tab
 * @param {InstanceType<typeof import('../../models/tabs.js').TabsModel>} props.tabs
 * @param {{ current: string | null }} props.dragRef
 */
function TabItem({ tab, tabs, dragRef }) {
  // `For` may hand us a stale tab object after pin/dirty/mode updates, so all
  // mutable fields are derived from the live tabs signal by id.
  const live = useComputed(() => tabs.tabs.value.find((t) => t.id === tab.id) ?? tab);
  const name = useComputed(() => {
    const t = live.value;

    if (t.kind === 'pr') return t.title ?? `#${t.number}`;

    return t.kind === 'compare' ? t.title : splitPath(t.path).name;
  });
  const cls = useComputed(() => {
    const t = live.value;

    return `editor-tab${tabs.activeId.value === t.id ? ' active' : ''}${t.preview ? ' preview' : ''}${
      t.dirty ? ' dirty' : ''
    }`;
  });
  const modeLabel = useComputed(() => {
    const t = live.value;

    return t.kind === 'diff' ? (MODE_LABEL[t.mode] ?? '') : '';
  });
  const title = useComputed(() => {
    const t = live.value;

    if (t.kind === 'pr') return t.title ?? `#${t.number}`;

    if (t.kind === 'compare') {
      return t.mergeBase
        ? `Working tree vs merge base of HEAD and ${t.ref}`
        : `Working tree vs ${t.ref}`;
    }

    return `${t.path}${t.kind === 'diff' ? ` (${t.mode} diff)` : ''}`;
  });

  return (
    <div
      class={cls}
      role="tab"
      title={title}
      draggable
      data-tab-id={tab.id}
      onMouseDown={(e) => {
        // Middle click closes (and must not start browser autoscroll).
        if (e.button === 1) e.preventDefault();
      }}
      onClick={() => tabs.activate(tab.id)}
      onDblClick={() => tabs.pin(tab.id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          tabs.requestClose(tab.id);
        }
      }}
      onDragStart={(e) => {
        dragRef.current = tab.id;
        e.dataTransfer?.setData('text/plain', tab.id);
      }}
      onDragOver={(e) => {
        if (dragRef.current) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = dragRef.current;
        dragRef.current = null;

        if (!from || from === tab.id) return;
        tabs.reorder(from, tabs.tabs.peek().findIndex((t) => t.id === tab.id));
      }}
      onDragEnd={() => {
        dragRef.current = null;
      }}
    >
      <span class="editor-tab-name">{name}</span>
      <span class="editor-tab-mode">{modeLabel}</span>
      <button
        type="button"
        class="editor-tab-close"
        aria-label="Close tab"
        title="Close (Alt+click: close others)"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();

          if (e.altKey) tabs.closeOthers(tab.id);
          else tabs.requestClose(tab.id);
        }}
      >
        <span class="editor-tab-dot" aria-hidden="true" />
        <IconX size={11} stroke={2} class="editor-tab-x" />
      </button>
    </div>
  );
}

/**
 * Horizontal tab strip for the island header.
 * @param {Object} props
 * @param {InstanceType<typeof import('../../models/tabs.js').TabsModel>} props.tabs
 */
export function TabStrip({ tabs }) {
  const dragRef = useRef(/** @type {string | null} */ (null));
  const strip = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Keep the active tab visible when the strip overflows.
  useEffect(() => {
    return tabs.activeId.subscribe((id) => {
      if (!id || !strip.current) return;
      requestAnimationFrame(() => {
        const el = [...(strip.current?.children ?? [])].find((c) => c.dataset.tabId === id);
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
  }, [tabs]);

  return (
    <div class="editor-tabs" role="tablist" ref={strip}>
      <For each={tabs.tabs}>
        {(tab) => <TabItem key={tab.id} tab={tab} tabs={tabs} dragRef={dragRef} />}
      </For>
    </div>
  );
}
