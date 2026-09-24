/** @typedef {import('./types').ConnectorSlot} ConnectorSlot */

/** Stable slot ids — must match connectors/slots.go */
export const SLOT = {
  headerReviews: 'header.reviews',
  headerCreateReview: 'header.createReview',
  preferencesPanel: 'preferences.panel',
};

/** Slot kinds — must match connectors/slots.go */
export const SLOT_KIND = {
  reviewPicker: 'review-picker',
  createReview: 'create-review',
  connectorSettings: 'connector-settings',
};

/**
 * @param {ConnectorSlot[]} slots
 * @param {string} slotId
 * @param {string} [kind]
 */
export function findSlot(slots, slotId, kind) {
  return slots.find((s) => {
    if (s.slot !== slotId || !s.visible) return false;
    if (kind && s.kind !== kind) return false;
    return true;
  });
}

/**
 * Preference tabs contributed by connectors.
 * @param {ConnectorSlot[]} slots
 */
export function preferencePanelSlots(slots) {
  return slots.filter(
    (s) => s.slot === SLOT.preferencesPanel && s.visible && s.kind === SLOT_KIND.connectorSettings
  );
}
