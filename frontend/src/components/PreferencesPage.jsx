import { useState, useEffect } from 'preact/hooks';
import { IconX } from '@tabler/icons-preact';
import { GHSettings } from './GHSettings.jsx';
import { CISettings } from './CISettings.jsx';
import { SHORTCUTS } from '../keymap/shortcuts.js';

const SHORTCUT_SCOPES = [
  ['global', 'Everywhere'],
  ['palette', 'Command palette'],
  ['home', 'Home screen'],
  ['editor', 'Editor'],
  ['diff', 'Changes panel'],
  ['review', 'Review comments'],
  ['search', 'Search'],
  ['terminal', 'Terminal'],
];

/**
 * Read-only keyboard shortcut reference, generated from keymap/shortcuts.js.
 *
 * @param {Object} props
 * @param {boolean} props.isMac
 */
function ShortcutsSettings({ isMac }) {
  return (
    <div class="shortcuts-settings">
      <h2 class="shortcuts-heading">Keyboard shortcuts</h2>
      <p class="shortcuts-desc">Reference only. Shown for {isMac ? 'macOS' : 'Linux and Windows'}.</p>

      {SHORTCUT_SCOPES.map(([scope, label]) => {
        const rows = SHORTCUTS.filter((s) => s.scope === scope && (isMac ? s.mac : s.other));

        if (rows.length === 0) return null;

        return (
          <section class="shortcuts-group" key={scope}>
            <h3 class="shortcuts-group-title">{label}</h3>
            <ul class="shortcuts-list">
              {rows.map((s) => (
                <li class="shortcuts-row" key={s.id}>
                  <span class="shortcuts-desc-text">{s.description}</span>
                  <kbd class="shortcuts-kbd">{isMac ? s.mac : s.other}</kbd>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ installed: boolean, version: string, user: string }} props.ghStatus
 * @param {() => void} props.onRefreshGH
 * @param {'off' | 'all' | 'workflow'} props.ciNotifyMode
 * @param {(mode: 'off' | 'all' | 'workflow') => void} props.onCINotifyModeChange
 * @param {boolean} [props.isMac] platform for the shortcut reference (app.jsx resolves it via getPlatform)
 */
export function PreferencesPage({ open, onClose, ghStatus, onRefreshGH, ciNotifyMode, onCINotifyModeChange, isMac = false }) {
  const [activeTab, setActiveTab] = useState('github');

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }

    if (open) {
      document.addEventListener('keydown', onKey);

      return () => document.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="prefs-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div class="prefs-window">
        <div class="prefs-header">
          <span class="prefs-title">Preferences</span>
          <button type="button" class="prefs-close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div class="prefs-body">
          <aside class="prefs-sidebar">
            <button
              type="button"
              class={`prefs-tab${activeTab === 'general' ? ' active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              type="button"
              class={`prefs-tab${activeTab === 'github' ? ' active' : ''}`}
              onClick={() => setActiveTab('github')}
            >
              GitHub
            </button>
            <button
              type="button"
              class={`prefs-tab${activeTab === 'shortcuts' ? ' active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              Shortcuts
            </button>
          </aside>

          <main class="prefs-content">
            {activeTab === 'general' && (
              <CISettings mode={ciNotifyMode} onChange={onCINotifyModeChange} />
            )}
            {activeTab === 'github' && <GHSettings ghStatus={ghStatus} onRefresh={onRefreshGH} />}
            {activeTab === 'shortcuts' && <ShortcutsSettings isMac={isMac} />}
          </main>
        </div>
      </div>

      <style>{`
        .prefs-overlay {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
        }
        .prefs-window {
          width: 720px;
          height: 480px;
          max-width: 90vw;
          max-height: 90vh;
          background: var(--surface-raised);
          border-radius: 10px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .prefs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          flex-shrink: 0;
        }
        .prefs-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-h);
          font-family: var(--font-sans);
        }
        .prefs-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .prefs-close:hover {
          background: var(--accent-hover);
          color: var(--text);
        }
        .prefs-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .prefs-sidebar {
          width: 180px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          padding: 8px 10px;
          gap: 2px;
        }
        .prefs-tab {
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.1s, color 0.1s;
        }
        .prefs-tab:hover {
          background: var(--accent-bg);
          color: var(--text);
        }
        .prefs-tab.active {
          background: var(--accent-bg);
          color: var(--text-h);
          font-weight: 500;
        }
        .prefs-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px 24px 24px;
        }
        .shortcuts-settings {
          font-family: var(--font-sans);
          color: var(--text);
        }
        .shortcuts-heading {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-h);
          margin: 8px 0 4px;
        }
        .shortcuts-desc {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0 0 16px;
        }
        .shortcuts-group {
          margin-bottom: 18px;
        }
        .shortcuts-group-title {
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin: 0 0 6px;
        }
        .shortcuts-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .shortcuts-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 5px 0;
          font-size: 13px;
        }
        .shortcuts-desc-text {
          color: var(--text);
        }
        .shortcuts-kbd {
          flex-shrink: 0;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          line-height: 1;
          padding: 3px 6px;
          border-radius: 4px;
          border: 1px solid var(--border, rgba(127, 127, 127, 0.3));
          color: var(--text-muted);
          background: transparent;
          white-space: nowrap;
        }
        .prefs-empty-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
