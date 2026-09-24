import { PRPicker } from '../components/PRPicker.jsx';
import { findSlot, SLOT, SLOT_KIND } from './slots.js';

/**
 * Renders header actions from the connector slot manifest.
 *
 * @param {Object} props
 * @param {import('./types').ConnectorSlot[]} props.slots
 * @param {number|null} props.selectedPR
 * @param {{ number: number, title: string, author: string, baseBranch: string }|null} props.currentPR
 * @param {(pr: { number: number, title: string, author: string, baseBranch: string } | null) => void} props.onSelectPR
 * @param {(title: string, message: string) => void} [props.onError]
 * @param {() => void} props.onCreatePR
 */
export function HeaderConnectorSlots({
  slots,
  selectedPR,
  currentPR,
  onSelectPR,
  onError,
  onCreatePR,
}) {
  const createSlot = findSlot(slots, SLOT.headerCreateReview, SLOT_KIND.createReview);
  const reviewSlot = findSlot(slots, SLOT.headerReviews, SLOT_KIND.reviewPicker);

  if (!createSlot && !reviewSlot) {
    return null;
  }

  const createLabel =
    typeof createSlot?.payload?.label === 'string' ? createSlot.payload.label : '+PR';

  return (
    <div class="island-header-actions">
      {createSlot ? (
        <button
          type="button"
          class="create-pr-trigger"
          onClick={onCreatePR}
          title="Create review"
          disabled={!createSlot.enabled}
        >
          {createLabel}
        </button>
      ) : null}
      {reviewSlot ? (
        <PRPicker
          selectedPR={selectedPR}
          currentPR={currentPR}
          onSelect={onSelectPR}
          onError={onError}
          disabled={!reviewSlot.enabled}
          connectorId={reviewSlot.connectorId}
          reviewLabel={
            typeof reviewSlot.payload?.reviewLabel === 'string'
              ? reviewSlot.payload.reviewLabel
              : 'PR'
          }
        />
      ) : null}
    </div>
  );
}
