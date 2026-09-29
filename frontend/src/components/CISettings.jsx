import { api } from '../wails.js';

/**
 * Controlled CI notification prefs. Truth lives in the parent; this only renders + persists.
 *
 * @param {Object} props
 * @param {'off' | 'all' | 'workflow'} props.mode
 * @param {(mode: 'off' | 'all' | 'workflow') => void} props.onChange
 */
export function CISettings({ mode, onChange }) {
  const enabled = mode !== 'off';

  const persist = (next) => {
    onChange(next);
    api.setCIPrefs(next).catch(() => {});
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
          checked={enabled}
          onChange={(e) => persist(e.currentTarget.checked ? 'all' : 'off')}
        />
        <span>Enable CI completion notifications</span>
      </label>

      <fieldset class="ci-settings-modes" disabled={!enabled}>
        <legend class="ci-settings-legend">Notify when</legend>
        <label class="ci-settings-row">
          <input
            type="radio"
            name="ci-notify-mode"
            checked={mode === 'all'}
            onChange={() => persist('all')}
          />
          <span>All checks on the PR have finished</span>
        </label>
        <label class="ci-settings-row">
          <input
            type="radio"
            name="ci-notify-mode"
            checked={mode === 'workflow'}
            onChange={() => persist('workflow')}
          />
          <span>Each workflow group finishes (one notification per workflow)</span>
        </label>
      </fieldset>
    </div>
  );
}
