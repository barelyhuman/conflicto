import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { IconChevronDown, IconX } from '@tabler/icons-preact';
import { VirtualList } from './VirtualList.jsx';
import { AnchoredMenu } from './AnchoredMenu.jsx';
import { api } from '../wails.js';

/**
 * @param {Object} props
 * @param {number|null} props.selectedPR
 * @param {{ number: number, title: string, author: string, baseBranch: string }|null} props.currentPR
 * @param {(pr: { number: number, title: string, author: string, baseBranch: string } | null) => void} props.onSelect
 * @param {(title: string, message: string) => void} [props.onError]
 */
export function PRPicker({ selectedPR, currentPR, onSelect, onError }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const cacheRef = useRef({ query: '', limit: 10, results: [], fetchedAt: 0 });
  const lastFetchRef = useRef(0);
  const debounceRef = useRef(null);
  const queryRef = useRef('');

  // Keep queryRef in sync with query state for async handlers
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const fetchPRs = useCallback(
    async (newLimit, newQuery, isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const data = await api.searchPRList(newLimit, newQuery);
        cacheRef.current = {
          query: newQuery,
          limit: newLimit,
          results: data,
          fetchedAt: Date.now(),
        };
        setResults(data);
        setHasMore(data.length >= newLimit);
        setLimit(newLimit);
        // Do NOT setQuery here — query is owned by the input
      } catch (err) {
        if (!isBackground) {
          onError?.('PR Search Error', err.message || String(err));
        }
      } finally {
        lastFetchRef.current = Date.now();
        if (!isBackground) setLoading(false);
      }
    },
    [onError]
  );

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Stale-While-Revalidate: restore cache on open, always refresh in background
  useEffect(() => {
    if (!open) return;
    const cache = cacheRef.current;
    if (cache.fetchedAt > 0 && Date.now() - cache.fetchedAt < 30000) {
      setResults(cache.results);
      setLimit(cache.limit);
      setHasMore(cache.results.length >= cache.limit);
    }
    fetchPRs(cache.limit, cache.query, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPRs(10, query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  function handleScrollEnd() {
    if (loading || !hasMore) return;
    if (Date.now() - lastFetchRef.current < 500) return;
    const nextLimit = limit + 10;
    fetchPRs(nextLimit, queryRef.current);
  }

  function selectPR(pr) {
    onSelect(pr);
    setOpen(false);
  }

  function closePR() {
    onSelect(null);
    setOpen(false);
  }

  return (
    <div class="pr-picker">
      <button
        ref={triggerRef}
        type="button"
        class={`pr-trigger${selectedPR ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span class="pr-label">
          {currentPR ? `#${currentPR.number} ${currentPR.title}` : 'PRs'}
        </span>
        <IconChevronDown size={10} class={open ? 'open' : ''} />
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom"
        alignment="end"
        offset={4}
        className="pr-dropdown"
      >
        <div class="pr-dropdown-header">
          {selectedPR && (
            <button type="button" class="pr-close" onClick={closePR}>
              <IconX size={12} />
              Close PR #{selectedPR}
            </button>
          )}
          <input
            ref={searchRef}
            type="text"
            class="pr-search"
            value={query}
            placeholder="Search PRs..."
            onInput={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                e.target.select();
              }
            }}
          />
        </div>

        <div class="pr-dropdown-body">
          {results.length === 0 && !loading ? (
            <div class="pr-empty">No PRs found</div>
          ) : (
            <VirtualList
              className="pr-virtual-list"
              items={results}
              itemHeight={48}
              overscan={3}
              onScrollEnd={handleScrollEnd}
              renderItem={(pr) => (
                <button
                  type="button"
                  class={`pr-option${selectedPR === pr.number ? ' selected' : ''}`}
                  onClick={() => selectPR(pr)}
                >
                  <div class="pr-option-top">
                    <span class="pr-number">#{pr.number}</span>
                    <span class="pr-title">{pr.title}</span>
                  </div>
                  <div class="pr-option-meta">
                    {pr.author} &rarr; {pr.baseBranch}
                  </div>
                </button>
              )}
            />
          )}

          {loading && <div class="pr-loading">Loading...</div>}
        </div>
      </AnchoredMenu>

      <style>{`
        .pr-picker {
          position: relative;
          display: inline-block;
        }
        .pr-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 5px;
          border: none;
          background: var(--surface-raised);
          color: var(--text-muted);
          font-family: var(--font-sans);
          font-size: 12px;
          line-height: 1.25;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          max-width: 200px;
        }
        .pr-trigger.active {
          color: var(--text);
        }
        .pr-trigger:hover {
          background: var(--accent-hover);
        }
        .pr-trigger svg {
          transition: transform 0.15s;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .pr-trigger svg.open {
          transform: rotate(180deg);
        }
        .pr-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .anchored-menu.pr-dropdown {
          min-width: 280px;
          max-width: 340px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }
        .pr-dropdown-header {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pr-dropdown-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .pr-search {
          width: 100%;
          padding: 6px 10px;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          font-size: 12px;
          outline: none;
          box-sizing: border-box;
        }
        .pr-search:focus {
          border-color: var(--accent);
        }
        .pr-virtual-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .pr-empty {
          padding: 16px;
          text-align: center;
          font-size: 12px;
          color: var(--text-muted);
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pr-loading {
          padding: 6px;
          text-align: center;
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .pr-close {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--removed);
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.1s;
          margin-bottom: 2px;
        }
        .pr-close:hover {
          background: var(--removed-bg);
        }
        .pr-close svg {
          flex-shrink: 0;
        }
        .pr-option {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          transition: background 0.1s;
          box-sizing: border-box;
        }
        .pr-option:hover {
          background: var(--accent-bg);
        }
        .pr-option.selected {
          color: var(--text-h);
          background: var(--accent-bg);
        }
        .pr-option-top {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 2px;
        }
        .pr-number {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .pr-title {
          font-size: 12px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pr-option-meta {
          font-size: 11px;
          color: var(--text-muted);
          padding-left: 28px;
        }
      `}</style>
    </div>
  );
}
