import { useSignal, useComputed } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { useEffect, useRef } from 'preact/hooks';
import { IconPencil, IconTrash } from '@tabler/icons-preact';
import { api } from '../wails.js';

export const reviewStyles = `
  .review-composer, .review-draft {
    font-family: var(--font-sans);
    font-size: 12px;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 12px 10px;
    padding: 10px 12px;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .review-draft {
    gap: 4px;
    border-style: dashed;
    border-left: 3px dashed var(--text-muted);
  }
  .review-draft.outdated { opacity: 0.7; }
  .review-draft-header, .review-composer-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .review-draft-header { justify-content: space-between; }
  .review-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .review-badge.warn { color: var(--text); border-style: dashed; }
  .review-draft-body { white-space: pre-wrap; }
  .review-icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border: none; border-radius: 5px;
    background: transparent; color: var(--text-muted); cursor: pointer; padding: 0;
  }
  .review-icon-btn:hover { background: var(--accent-hover); color: var(--text); }
  .review-composer-loc { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
  .review-composer textarea, .review-bar-pop textarea {
    width: 100%;
    min-height: 72px;
    resize: vertical;
    box-sizing: border-box;
    font: inherit;
    font-size: 12px;
    padding: 8px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
  }
  .review-composer textarea:focus, .review-bar-pop textarea:focus { border-color: var(--text-muted); }
  .review-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .review-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .review-btn:disabled { opacity: 0.45; cursor: default; }
  .review-btn.primary { background: var(--text); color: var(--bg); border-color: var(--text); }
  .review-btn.primary:hover:not(:disabled) { background: var(--text); opacity: 0.85; }
  .review-spacer { flex: 1; }
  .review-suggestion {
    display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted);
  }
  .review-kbd { opacity: 0.7; font-size: 10px; margin-left: 4px; }
`;

/** Inline composer rendered under the selected range. Remounted per composer.rev. */
export function ReviewComposer({ review }) {
  const initial = review.composer.peek();
  const body = useSignal(initial?.initialBody ?? '');
  const busy = useSignal(false);
  const textRef = useRef(null);

  const location = useComputed(() => {
    const c = review.composer.value;

    if (!c) return '';
    const { loc } = c;
    const side = loc.side === 'LEFT' ? ' (old)' : '';

    return loc.startLine
      ? `${c.path}:${loc.startLine}-${loc.line}${side}`
      : `${c.path}:${loc.line}${side}`;
  });
  const suggestion = useComputed(() => review.composer.value?.suggestion ?? null);
  const title = useComputed(() => (review.composer.value?.editId ? 'Save' : 'Add to review'));
  const noText = useComputed(() => busy.value || !body.value.trim());

  useEffect(() => {
    const el = textRef.current;

    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  async function run(fn) {
    if (busy.peek() || !body.peek().trim()) return;
    busy.value = true;

    try {
      await fn(body.peek());
    } finally {
      busy.value = false;
    }
  }

  async function pasteClipboard() {
    try {
      const text = ((await api.clipboardGetText()) ?? '').trim();

      if (text) body.value = body.peek() ? `${body.peek()}\n${text}` : text;
    } catch {
      /* clipboard unavailable */
    }
  }

  function onKeyDown(e) {
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      review.closeComposer();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run((b) => review.addToReview(b));
    }
  }

  return (
    <div class="review-composer" onClick={(e) => e.stopPropagation()}>
      <span class="review-composer-loc">{location}</span>
      <Show when={suggestion}>
        {(s) => (
          <div class="review-suggestion">
            <span>Clipboard starts with {s.label}.</span>
            <button type="button" class="review-btn" onClick={() => review.acceptSuggestion()}>
              Attach there instead
            </button>
          </div>
        )}
      </Show>
      <textarea
        ref={textRef}
        value={body}
        placeholder="Leave a comment"
        onInput={(e) => {
          body.value = e.currentTarget.value;
        }}
        onKeyDown={onKeyDown}
      />
      <div class="review-composer-actions">
        <button type="button" class="review-btn" onClick={pasteClipboard} title="Append clipboard text">
          Paste clipboard
        </button>
        <span class="review-spacer" />
        <button type="button" class="review-btn" onClick={() => review.closeComposer()}>
          Cancel
        </button>
        <Show when={() => !review.composer.value?.editId}>
          <button
            type="button"
            class="review-btn"
            disabled={noText}
            onClick={() => run((b) => review.commentNow(b))}
          >
            Comment now
          </button>
        </Show>
        <button
          type="button"
          class="review-btn primary"
          disabled={noText}
          onClick={() => run((b) => review.addToReview(b))}
        >
          {title}
          <span class="review-kbd">⌘↵</span>
        </button>
      </div>
    </div>
  );
}

/** A pending (draft) comment rendered inline. */
export function ReviewDraftCard({ review, draft, outdated }) {
  const range = draft.startLine ? `lines ${draft.startLine}-${draft.line}` : `line ${draft.line}`;

  return (
    <div class={`review-draft${outdated ? ' outdated' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div class="review-draft-header">
        <span class="review-draft-meta">
          <span class="review-badge">Pending</span>
          {outdated ? (
            <span class="review-badge warn" title="This line is no longer in the diff">
              Outdated
            </span>
          ) : null}{' '}
          <span class="review-composer-loc">{range}</span>
        </span>
        <span class="review-draft-actions">
          <button
            type="button"
            class="review-icon-btn"
            title="Edit"
            aria-label="Edit pending comment"
            onClick={() => review.editDraft(draft.id)}
          >
            <IconPencil size={12} stroke={2} />
          </button>
          <button
            type="button"
            class="review-icon-btn"
            title="Delete"
            aria-label="Delete pending comment"
            onClick={() => review.deleteDraft(draft.id)}
          >
            <IconTrash size={12} stroke={2} />
          </button>
        </span>
      </div>
      <span class="review-draft-body">{draft.body}</span>
    </div>
  );
}
