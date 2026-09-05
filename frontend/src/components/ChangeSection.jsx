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
 * @param {{ title: string, icon: import('preact').ComponentChildren, show: import('@preact/signals-core').Signal<boolean>|boolean, onClick: () => void }[]} [props.actions]
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
  actions,
  children,
}) {
  const headerActions = actions ?? (actionIcon && showAction != null ? [{
    title: actionTitle,
    icon: actionIcon,
    show: showAction,
    onClick: onAction,
  }] : []);

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
          {headerActions.map((action) => {
            const button = (
              <button
                type="button"
                class="sg-icon-btn change-section-action"
                title={action.title}
                aria-label={action.title}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick?.();
                }}
              >
                {action.icon}
              </button>
            );
            return typeof action.show === 'object' && action.show !== null && 'value' in action.show
              ? <Show key={action.title} when={action.show}>{button}</Show>
              : action.show ? button : null;
          })}
          <span class="sg-count change-section-count">{count}</span>
        </div>
      </div>
      {open && <div class="change-section-body">{children}</div>}
    </section>
  );
}
