import { Show } from '@preact/signals/utils';
import { IconChevronRight } from '@tabler/icons-preact';

/**
 * Collapsible sidebar section header + body (shared by FileTree, WorktreesPanel).
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {import('@preact/signals-core').Signal<number>|number} props.count
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {string} [props.className] - extra class on the section element
 * @param {string} [props.actionTitle]
 * @param {import('preact').ComponentChildren} [props.actionIcon]
 * @param {import('@preact/signals-core').Signal<boolean>|boolean} [props.showAction]
 * @param {() => void} [props.onAction]
 * @param {import('preact').ComponentChildren} props.children
 */
export function ChangeSection({
  title,
  count,
  open,
  onToggle,
  className = '',
  actionTitle,
  actionIcon,
  showAction,
  onAction,
  children,
}) {
  return (
    <section
      class={`change-section${open ? ' change-section-open' : ' change-section-collapsed'}${className ? ` ${className}` : ''}`}
    >
      <div class="sg-header change-section-header">
        <button
          type="button"
          class="change-section-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span class={`change-section-chevron${open ? ' open' : ''}`} aria-hidden="true">
            <IconChevronRight size={12} stroke={1.75} />
          </span>
          <span class="sg-title change-section-title">{title}</span>
        </button>
        <div class="sg-actions change-section-actions">
          {actionIcon && showAction != null && (
            typeof showAction === 'object' && 'value' in showAction ? (
              <Show when={showAction}>
                <button
                  type="button"
                  class="sg-icon-btn change-section-action"
                  title={actionTitle}
                  aria-label={actionTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.();
                  }}
                >
                  {actionIcon}
                </button>
              </Show>
            ) : showAction ? (
              <button
                type="button"
                class="sg-icon-btn change-section-action"
                title={actionTitle}
                aria-label={actionTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.();
                }}
              >
                {actionIcon}
              </button>
            ) : null
          )}
          <span class="sg-count change-section-count">{count}</span>
        </div>
      </div>
      {open && <div class="change-section-body">{children}</div>}
    </section>
  );
}
