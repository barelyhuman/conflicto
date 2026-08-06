import { useState, useEffect } from 'preact/hooks';
import { IconX } from '@tabler/icons-preact';
import { GHSettings } from './GHSettings.jsx';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ installed: boolean, version: string, user: string }} props.ghStatus
 * @param {() => void} props.onRefreshGH
 */
export function PreferencesPage({ open, onClose, ghStatus, onRefreshGH }) {
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
          </aside>

          <main class="prefs-content">
            {activeTab === 'general' && (
              <div class="prefs-empty-tab">
                <p>General settings coming soon.</p>
              </div>
            )}
            {activeTab === 'github' && <GHSettings ghStatus={ghStatus} onRefresh={onRefreshGH} />}
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
