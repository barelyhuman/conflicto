import { useEffect, useRef } from 'preact/hooks';
import { useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { For, Show } from '@preact/signals/utils';
import { IconFolderOpen, IconRefresh, IconSearch } from '@tabler/icons-preact';
import { filterEntries } from '../palette/fuzzy.js';
import { WorkspaceRow } from '../palette/WorkspaceRow.jsx';
import { buildSections, formatAgo, listRepos, scopeToRepo } from './homeSections.js';
import './home.css';

const MAX_RESULTS = 200;

function RepoItem({ repo, selected, zone, onPick }) {
  const className = useComputed(
    () => `home-repo${selected.value === repo.repoPath ? ' selected' : ''}${zone.value === 'repos' ? ' focused' : ''}`
  );

  return (
    <button
      type="button"
      tabIndex={-1}
      class={className}
      onClick={() => onPick(repo.repoPath)}
    >
      <span class="home-repo-name">{repo.repoName}</span>
      <span class="home-repo-count">{repo.count}</span>
    </button>
  );
}

/**
 * Full-size browse view over the workspace index. Same data, matcher and rows
 * as the command palette.
 *
 * @param {Object} props
 * @param {InstanceType<typeof import('../../models/workspaceIndex.js').WorkspaceIndexModel>} props.index
 * @param {{ installed: boolean, user: string }} props.ghStatus
 * @param {(() => void) | null} props.onClose return to the current workspace (null when none is open)
 * @param {(path: string) => void} props.onRemoveWorktree
 * @param {() => void} props.onOpenProject
 */
export function HomeScreen({ index, ghStatus, onClose, onRemoveWorktree, onOpenProject }) {
  const query = useSignal('');
  const repoSel = useSignal('');
  const zone = useSignal(/** @type {'repos' | 'list'} */ ('list'));
  const selected = useSignal(0);
  const refreshing = useSignal(false);
  const now = useSignal(Date.now());
  const inputRef = useRef(null);

  const repos = useComputed(() => listRepos(index.entries.value));
  const repoRows = useComputed(() => [
    { repoPath: '', repoName: 'All repos', count: repos.value.reduce((n, r) => n + r.count, 0) },
    ...repos.value,
  ]);

  const view = useComputed(() => {
    const scoped = scopeToRepo(index.entries.value, repoSel.value);
    const q = query.value.trim();

    if (!q) return buildSections(scoped);

    const flat = filterEntries(scoped, q, MAX_RESULTS).map((r, pos) => ({ ...r, pos }));

    return { sections: [{ key: 'results', title: 'Results', items: flat }], flat };
  });
  const sections = useComputed(() => view.value.sections);
  const count = useComputed(() => view.value.flat.length);
  const empty = useComputed(() => count.value === 0);
  const hasIndex = useComputed(() => index.entries.value.length > 0);
  const refreshClass = useComputed(() => `home-icon-btn${refreshing.value ? ' spinning' : ''}`);
  const agoText = useComputed(() => `Updated ${formatAgo(index.fetchedAt.value, now.value)}`);
  const searching = useComputed(() => query.value.trim() !== '');
  const emptyText = useComputed(() => {
    if (searching.value) return 'No matches';

    return hasIndex.value ? 'Nothing here yet' : 'No workspaces yet. Open a project to get started.';
  });

  useEffect(() => {
    inputRef.current?.focus();
    index.refresh();
    const t = setInterval(() => { now.value = Date.now(); }, 15000);

    return () => clearInterval(t);
  }, [index, now]);

  // Reset selection whenever the visible set changes.
  useSignalEffect(() => {
    query.value;
    repoSel.value;
    selected.value = 0;
  });

  useSignalEffect(() => {
    document.getElementById(`home-opt-${selected.value}`)?.scrollIntoView?.({ block: 'nearest' });
  });

  async function pick(entry) {
    if (!entry) return;

    await index.open(entry.id);
    // Opening switches project; app.jsx hides home on the project-changed event.
  }

  async function refresh() {
    refreshing.value = true;
    await index.refresh();
    setTimeout(() => { refreshing.value = false; }, 1200);
  }

  function move(delta) {
    if (zone.peek() === 'repos') {
      const rows = repoRows.peek();
      const i = rows.findIndex((r) => r.repoPath === repoSel.peek());
      repoSel.value = rows[(Math.max(i, 0) + delta + rows.length) % rows.length].repoPath;

      return;
    }

    const n = count.peek();

    if (n) selected.value = (selected.peek() + delta + n) % n;
  }

  function onKeyDown(e) {
    const inInput = e.target === inputRef.current;
    const hasText = inInput && inputRef.current.value !== '';

    if (e.key === 'Escape') {
      e.preventDefault();

      if (query.peek()) query.value = '';
      else onClose?.();
    } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      zone.value = zone.peek() === 'repos' ? 'list' : 'repos';
    } else if (e.key === 'ArrowLeft' && !hasText) {
      e.preventDefault();
      zone.value = 'repos';
    } else if (e.key === 'ArrowRight' && !hasText) {
      e.preventDefault();
      zone.value = 'list';
    } else if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();

      if (zone.peek() === 'repos') zone.value = 'list';
      else pick(view.peek().flat[selected.peek()]?.entry);
    } else if (!inInput && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typing anywhere focuses the search field (the key lands in it).
      inputRef.current?.focus();
      zone.value = 'list';
    }
  }

  return (
    <div class="home-screen" role="region" aria-label="Home" onKeyDown={onKeyDown}>
      <div class="home-header">
        <div class="home-search">
          <IconSearch size={16} stroke={1.5} />
          <input
            ref={inputRef}
            class="home-input"
            type="text"
            placeholder="Search repos, PRs and worktrees"
            aria-label="Search workspaces"
            spellcheck={false}
            autocomplete="off"
            value={query}
            onInput={(e) => { query.value = e.currentTarget.value; zone.value = 'list'; }}
          />
        </div>
        <div class="home-status">
          <span class="home-gh">
            {ghStatus?.installed && ghStatus?.user
              ? `Signed in as ${ghStatus.user}`
              : 'gh not available — PRs hidden'}
          </span>
          <span class="home-ago">{agoText}</span>
          <button
            type="button"
            class={refreshClass}
            title="Refresh"
            aria-label="Refresh workspace index"
            onClick={refresh}
          >
            <IconRefresh size={16} stroke={1.5} />
          </button>
          <button type="button" class="home-icon-btn" title="Open project" aria-label="Open project" onClick={onOpenProject}>
            <IconFolderOpen size={16} stroke={1.5} />
          </button>
        </div>
      </div>

      <div class="home-body">
        <nav class="home-repos" aria-label="Repositories">
          <For each={repoRows}>
            {(repo) => (
              <RepoItem
                key={repo.repoPath}
                repo={repo}
                selected={repoSel}
                zone={zone}
                onPick={(p) => { repoSel.value = p; zone.value = 'list'; }}
              />
            )}
          </For>
        </nav>

        <div class="home-list" role="listbox" aria-label="Workspaces">
          <For each={sections}>
            {(section) => (
              <section key={section.key} class={`home-section ${section.key}`}>
                <h2 class="home-section-title">{section.title}</h2>
                {section.items.map((item) => (
                  <WorkspaceRow
                    key={item.entry.id}
                    item={item}
                    selected={selected}
                    opening={index.opening}
                    idPrefix="home-opt"
                    onPick={pick}
                    onHover={(pos) => { selected.value = pos; }}
                    onRemove={(entry) => onRemoveWorktree(entry.path)}
                  />
                ))}
              </section>
            )}
          </For>
          <Show when={empty}>
            <div class="palette-empty">{emptyText}</div>
          </Show>
        </div>
      </div>
    </div>
  );
}
