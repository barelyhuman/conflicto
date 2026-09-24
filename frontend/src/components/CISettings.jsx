import { useState, useEffect } from 'preact/hooks';
import { api } from '../wails.js';

/**
 * @param {Object} props
 * @param {{ enabled: boolean, mode: string }} props.prefs
 * @param {(prefs: { enabled: boolean, mode: string }) => void} props.onChange
 */
export function CISettings({ prefs, onChange }) {
  const [enabled, setEnabled] = useState(prefs.enabled);
  const [mode, setMode] = useState(prefs.mode || 'all');

  useEffect(() => {
    setEnabled(prefs.enabled);
    setMode(prefs.mode || 'all');
  }, [prefs.enabled, prefs.mode]);

  const persist = (nextEnabled, nextMode) => {
    setEnabled(nextEnabled);
    setMode(nextMode);
    onChange({ enabled: nextEnabled, mode: nextMode });
    api.setCIPrefs(nextEnabled, nextMode).catch(() => {});
  };

  return (
    <div class="ci-settings">
      <h2 class="ci-settings-heading">Pull request CI</h2>
      <p class="ci-settings-desc">
        While a PR is open in conflicto, the header shows live CI status.
        Optional desktop notifications fire when checks finish.
      </p>

      <label class="ci-settings-row">
        <input
          type="checkbox"
          checked={enabled && mode !== 'off'}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            persist(on, on ? (mode === 'off' ? 'all' : mode) : mode);
          }}
        />
        <span>Enable CI completion notifications</span>
      </label>

      <fieldset class="ci-settings-modes" disabled={!enabled || mode === 'off'}>
        <legend class="ci-settings-legend">Notify when</legend>
        <label class="ci-settings-row">
          <input
            type="radio"
            name="ci-notify-mode"
            checked={mode === 'all'}
            onChange={() => persist(true, 'all')}
          />
          <span>All checks on the PR have finished</span>
        </label>
        <label class="ci-settings-row">
          <input
            type="radio"
            name="ci-notify-mode"
            checked={mode === 'workflow'}
            onChange={() => persist(true, 'workflow')}
          />
          <span>Each workflow group finishes (one notification per workflow)</span>
        </label>
      </fieldset>

      <style>{`
        .ci-settings-heading {
          margin: 0 0 6px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-h);
        }
        .ci-settings-desc {
          margin: 0 0 16px;
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .ci-settings-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          color: var(--text);
          margin-bottom: 10px;
          cursor: pointer;
        }
        .ci-settings-row input {
          margin-top: 2px;
        }
        .ci-settings-modes {
          border: none;
          margin: 8px 0 0;
          padding: 0;
        }
        .ci-settings-legend {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .ci-settings-modes:disabled {
          opacity: 0.45;
        }
      `}</style>
    </div>
  );
}
