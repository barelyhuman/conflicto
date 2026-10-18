import { useSignal, useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { reviewStyles } from './ReviewComposer.jsx';

const barStyles = `
  .review-bar { position: relative; display: inline-flex; }
  .review-bar-trigger {
    font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 6px;
    border: 1px dashed var(--border); background: transparent; color: var(--text); cursor: pointer;
  }
  .review-bar-trigger:hover { background: var(--accent-hover); }
  .review-bar-pop {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 320px;
    display: flex; flex-direction: column; gap: 8px; padding: 12px;
    background: var(--surface-raised); border: 1px solid var(--border); border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); font-size: 12px;
  }
  .review-bar-pop h4 { margin: 0; font-size: 12px; }
  .review-bar-warn { color: var(--text-muted); font-size: 11px; }
  .review-bar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
`;

/**
 * "Review · N pending" with a submit popover (PR mode only; parent gates).
 *
 * @param {{ review: InstanceType<typeof import('../models/review.js').ReviewModel> }} props
 */
export function ReviewBar({ review }) {
  const open = useSignal(false);
  const summary = useSignal('');
  const label = useComputed(() => `Review · ${review.pendingCount.value} pending`);
  const heading = useComputed(() => `Submit review (${review.pendingCount.value} comments)`);
  const outdatedMsg = useComputed(() => {
    const n = review.outdatedCount.value;

    return n
      ? `${n} pending comment${n === 1 ? ' is' : 's are'} outdated (line no longer in the diff). Edit or delete before submitting.`
      : '';
  });
  const blocked = useComputed(() => review.submitting.value || review.outdatedCount.value > 0);
  const needsText = useComputed(
    () => blocked.value || (review.pendingCount.value === 0 && !summary.value.trim())
  );

  async function send(event) {
    if (await review.submit(event, summary.peek())) {
      summary.value = '';
      open.value = false;
    }
  }

  return (
    <div
        class="review-bar"
        onKeyDown={(e) => {
          if (e.key === 'Escape') open.value = false;
        }}
      >
        <button
          type="button"
          class="review-bar-trigger"
          aria-haspopup="dialog"
          onClick={() => {
            open.value = !open.value;
          }}
        >
          {label}
        </button>
        <Show when={open}>
          <div class="review-bar-pop" role="dialog" aria-label="Submit review">
            <h4>{heading}</h4>
            <textarea
              value={summary}
              placeholder="Review summary (optional)"
              onInput={(e) => {
                summary.value = e.currentTarget.value;
              }}
            />
            <Show when={outdatedMsg}>{(msg) => <span class="review-bar-warn">{msg}</span>}</Show>
            <div class="review-bar-actions">
              <button type="button" class="review-btn" disabled={needsText} onClick={() => send('COMMENT')}>
                Comment
              </button>
              <button type="button" class="review-btn" disabled={blocked} onClick={() => send('APPROVE')}>
                Approve
              </button>
              <button
                type="button"
                class="review-btn"
                disabled={needsText}
                onClick={() => send('REQUEST_CHANGES')}
              >
                Request changes
              </button>
            </div>
          </div>
        </Show>
        <style>{reviewStyles}</style>
        <style>{barStyles}</style>
    </div>
  );
}
