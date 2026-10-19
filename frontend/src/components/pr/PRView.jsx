import { useEffect, useMemo } from 'preact/hooks';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import { IconExternalLink, IconRefresh } from '@tabler/icons-preact';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime.js';
import { prTabs } from '../../models/prTab.js';
import { prTabTitle } from '../../models/tabs.js';
import { openPRLocally } from '../../models/navigation.js';
import { DiffViewer } from '../DiffViewer.jsx';
import { ChangeTree } from '../ChangeTree.jsx';
import { ReviewBar } from '../ReviewBar.jsx';
import { PRChecksStatus } from '../PRChecksStatus.jsx';
import { isTerminalFocusTarget } from '../terminal/TerminalDock.jsx';
import { Markdown } from './Markdown.jsx';
import './pr.css';

const REVIEW_LABEL = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  DISMISSED: 'review dismissed',
};

function formatDate(iso) {
  const d = iso ? new Date(iso) : null;

  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '';
}

function stateLabel(d) {
  if (d.isDraft && d.state === 'OPEN') return 'Draft';

  return d.state ? d.state.charAt(0) + d.state.slice(1).toLowerCase() : '';
}

function stateClass(d) {
  return `pr-state pr-state-${d.isDraft && d.state === 'OPEN' ? 'draft' : (d.state || '').toLowerCase()}`;
}

/**
 * One pull-request tab. The model comes from the PR tab registry (keyed by
 * scope + number) so it survives moving the tab into a worktree scope.
 *
 * @param {{
 *   tabs: InstanceType<typeof import('../../models/tabs.js').TabsModel>,
 *   scope: string | null,
 *   number: number,
 * }} props
 */
export function PRView({ tabs, scope, number }) {
  const model = useMemo(() => prTabs.get(scope, number), [scope, number]);

  // Only the visible PR tab polls checks.
  useEffect(() => {
    model.setActive(true);

    return () => model.setActive(false);
  }, [model]);

  // The strip shows `#n title` once the details arrive.
  useSignalEffect(() => {
    const d = model.details.value;

    if (d?.title) tabs.setTitle(`pr:${number}`, prTabTitle(number, d.title));
  });

  // Alt+Up / Alt+Down: previous / next file (no bare keys by design).
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      if (model.view.peek() !== 'files') return;
      const t = e.target;

      if (isTerminalFocusTarget(t)) return;

      if (t?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      e.preventDefault();
      model.stepFile(e.key === 'ArrowDown' ? 1 : -1);
    }

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [model]);

  const isFiles = useComputed(() => model.view.value === 'files');

  return (
    <div class="pr-view">
      <PRHeader model={model} number={number} />
      <PRSwitch model={model} />
      <Show when={isFiles} fallback={<PRConversation model={model} />}>
        <PRFiles model={model} />
      </Show>
    </div>
  );
}

function PRHeader({ model, number }) {
  const opening = useSignal(false);

  async function goLocal() {
    opening.value = true;

    try {
      await openPRLocally(number);
    } finally {
      opening.value = false;
    }
  }

  return (
    <Show
      when={model.details}
      fallback={
        <Show
          when={model.error}
          fallback={<div class="pr-head pr-muted">Loading pull request…</div>}
        >
          {(msg) => (
            <div class="pr-head pr-error" role="alert">
              <span>Could not load #{number}: {msg}</span>
              <button type="button" class="pr-btn" onClick={() => model.refresh()}>
                Retry
              </button>
            </div>
          )}
        </Show>
      }
    >
      {(d) => (
        <header class="pr-head">
          <div class="pr-title-row">
            <h1 class="pr-title">{d.title}</h1>
            <span class="pr-number">#{d.number}</span>
            <span class={stateClass(d)}>{stateLabel(d)}</span>
          </div>
          <div class="pr-meta-row">
            <span>{d.author}</span>
            <span class="pr-ref">
              {d.baseRef} <span aria-label="from">←</span> {d.headRef}
            </span>
            <span class="pr-diffstat">
              <span class="pr-add">+{d.additions ?? 0}</span> <span class="pr-del">−{d.deletions ?? 0}</span>
            </span>
            <span>{d.changedFiles ?? 0} files</span>
            <PRChecksStatus active summary={d.checks ?? null} />
            <span class="pr-spacer" />
            {d.url ? (
              <button
                type="button"
                class="pr-icon-btn"
                title="Open on GitHub"
                aria-label="Open on GitHub"
                onClick={() => BrowserOpenURL(d.url)}
              >
                <IconExternalLink size={13} stroke={1.75} />
              </button>
            ) : null}
            <button
              type="button"
              class="pr-icon-btn"
              title="Refresh"
              aria-label="Refresh pull request"
              onClick={() => model.refresh()}
            >
              <IconRefresh size={13} stroke={1.75} />
            </button>
            <ReviewBar review={model.review} />
            <button type="button" class="pr-btn pr-btn-primary" disabled={opening} onClick={goLocal}>
              {d.worktreePath ? 'Go to worktree' : 'Open locally'}
            </button>
          </div>
        </header>
      )}
    </Show>
  );
}

function PRSwitch({ model }) {
  const filesCls = useComputed(() => (model.view.value === 'files' ? 'pr-seg active' : 'pr-seg'));
  const convoCls = useComputed(() => (model.view.value === 'conversation' ? 'pr-seg active' : 'pr-seg'));
  const filesLabel = useComputed(() => `Files ${model.files.value.length || ''}`.trim());
  const convoLabel = useComputed(() => {
    const n = model.timeline.value.length;

    return n ? `Conversation ${n}` : 'Conversation';
  });

  return (
    <div class="pr-switch" role="tablist" aria-label="Pull request view">
      <button type="button" role="tab" class={filesCls} onClick={() => model.setView('files')}>
        {filesLabel}
      </button>
      <button type="button" role="tab" class={convoCls} onClick={() => model.setView('conversation')}>
        {convoLabel}
      </button>
    </div>
  );
}

function PRFiles({ model }) {
  const hasFiles = useComputed(() => model.files.value.length > 0);
  const emptyText = useComputed(() => (model.filesLoading.value ? 'Loading files…' : 'No changed files'));

  return (
    <div class="pr-files">
      <nav class="pr-files-list" aria-label="Changed files">
        <Show
          when={model.filesError}
          fallback={
            <Show when={hasFiles} fallback={<div class="pr-muted pr-pad">{emptyText}</div>}>
              <PRFileTree model={model} />
            </Show>
          }
        >
          {(msg) => <div class="pr-error pr-pad">Could not load files: {msg}</div>}
        </Show>
      </nav>
      <div class="pr-files-diff">
        <Show
          when={model.patchError}
          fallback={
            <DiffViewer
              activeDiff={model.activeDiff}
              loading={model.diffLoading}
              isPRMode
              comments={model.comments}
              review={model.review}
              onSelectFile={(path) => model.selectFile(path)}
            />
          }
        >
          {(msg) => <div class="pr-diff-message pr-error">Could not load this file's patch: {msg}</div>}
        </Show>
      </div>
    </div>
  );
}

/** Leaf bridge: ChangeTree is array-based, so unbox the file + selection signals here. */
function PRFileTree({ model }) {
  const files = model.files.value;
  const active = model.selectedPath.value;

  return <ChangeTree files={files} activeFile={active} onSelect={(path) => model.selectFile(path)} />;
}

function PRConversation({ model }) {
  const hasTimeline = useComputed(() => model.timeline.value.length > 0);
  const emptyText = useComputed(() => (model.timelineLoading.value ? 'Loading activity…' : 'No activity yet.'));

  return (
    <div class="pr-convo">
      <div class="pr-convo-inner">
        <section class="pr-card">
          <Show when={model.details} fallback={<p class="pr-muted">Loading description…</p>}>
            {(d) =>
              d.body && d.body.trim() ? (
                <Markdown source={d.body} />
              ) : (
                <p class="pr-muted">No description provided.</p>
              )
            }
          </Show>
        </section>
        <h2 class="pr-section-title">Activity</h2>
        <Show when={model.timelineError}>
          {(msg) => <div class="pr-error">Could not load the timeline: {msg}</div>}
        </Show>
        <Show when={hasTimeline} fallback={<p class="pr-muted">{emptyText}</p>}>
          <PRTimeline model={model} />
        </Show>
      </div>
    </div>
  );
}

/** Leaf: renders the unboxed timeline list. */
function PRTimeline({ model }) {
  const items = model.timeline.value;

  return (
    <ol class="pr-timeline">
      {items.map((it, idx) => (
        <li key={`${it.createdAt}-${idx}`} class={`pr-card pr-event pr-event-${it.kind}`}>
          <div class="pr-event-head">
            <strong>{it.author || 'unknown'}</strong>
            <span class="pr-muted">
              {it.kind === 'review' ? (REVIEW_LABEL[it.state] ?? 'reviewed') : 'commented'}
            </span>
            <span class="pr-muted pr-event-date">{formatDate(it.createdAt)}</span>
            {it.url ? (
              <button
                type="button"
                class="pr-icon-btn"
                title="Open on GitHub"
                aria-label="Open on GitHub"
                onClick={() => BrowserOpenURL(it.url)}
              >
                <IconExternalLink size={12} stroke={1.75} />
              </button>
            ) : null}
          </div>
          {it.body ? <Markdown source={it.body} /> : null}
        </li>
      ))}
    </ol>
  );
}
