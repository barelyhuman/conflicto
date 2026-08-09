import { Quit, WindowMinimise, WindowToggleMaximise } from '../wailsjs/runtime/runtime.js';

/**
 * Custom traffic-light controls for the frameless window.
 * Clicks are no-drag so they register; the surrounding sidebar remains draggable.
 */
export function Titlebar() {
  return (
    <div class="titlebar no-drag" aria-label="Window controls">
      <button
        type="button"
        class="dot"
        title="Close"
        aria-label="Close"
        onClick={() => Quit()}
      />
      <button
        type="button"
        class="dot"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => WindowMinimise()}
      />
      <button
        type="button"
        class="dot"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => WindowToggleMaximise()}
      />
    </div>
  );
}
