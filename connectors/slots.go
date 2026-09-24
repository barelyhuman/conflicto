package connectors

// Slot identifiers are a stable contract with the frontend
// (see frontend/src/connectors/slots.js).
const (
	SlotHeaderReviews      = "header.reviews"
	SlotHeaderCreateReview = "header.createReview"
	SlotPreferencesPanel   = "preferences.panel"
)

// SlotKind tells the UI which component to mount in a slot.
const (
	SlotKindReviewPicker      = "review-picker"
	SlotKindCreateReview      = "create-review"
	SlotKindConnectorSettings = "connector-settings"
)

// UISlot is one connector's contribution to a UI mount point.
type UISlot struct {
	Slot        string                 `json:"slot"`
	ConnectorID string                 `json:"connectorId"`
	Visible     bool                   `json:"visible"`
	Enabled     bool                   `json:"enabled"`
	Kind        string                 `json:"kind"`
	Payload     map[string]interface{} `json:"payload,omitempty"`
}
