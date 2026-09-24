import { describe, it, expect } from 'vitest';
import { findSlot, preferencePanelSlots, SLOT, SLOT_KIND } from './slots.js';

describe('connector slots', () => {
  it('findSlot returns visible matching entries', () => {
    const slots = [
      { slot: SLOT.headerReviews, kind: SLOT_KIND.reviewPicker, visible: true, enabled: true, connectorId: 'github' },
      { slot: SLOT.headerReviews, kind: SLOT_KIND.reviewPicker, visible: false, enabled: true, connectorId: 'other' },
    ];
    expect(findSlot(slots, SLOT.headerReviews, SLOT_KIND.reviewPicker)?.connectorId).toBe('github');
  });

  it('preferencePanelSlots filters settings panels', () => {
    const slots = [
      { slot: SLOT.preferencesPanel, kind: SLOT_KIND.connectorSettings, visible: true, connectorId: 'github', payload: { tabId: 'github' } },
      { slot: SLOT.headerReviews, kind: SLOT_KIND.reviewPicker, visible: true, connectorId: 'github' },
    ];
    expect(preferencePanelSlots(slots)).toHaveLength(1);
  });
});
