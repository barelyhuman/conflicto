package connectors

import "fmt"

// Registry picks a ReviewConnector for a repository.
type Registry struct {
	connectors []ReviewConnector
}

// NewRegistry registers connectors in priority order (first match wins).
func NewRegistry(connectors ...ReviewConnector) *Registry {
	return &Registry{connectors: connectors}
}

// Resolve returns the first connector that matches repoPath.
func (r *Registry) Resolve(repoPath string) (ReviewConnector, error) {
	for _, c := range r.connectors {
		if c.MatchRepo(repoPath) {
			return c, nil
		}
	}
	return nil, fmt.Errorf("no review connector for %s", repoPath)
}

// PrimaryHostStatus returns host detection for the first registered connector
// (today GitHub / gh). The UI still uses a single host status event.
func (r *Registry) PrimaryHostStatus() HostStatus {
	if len(r.connectors) == 0 {
		return HostStatus{Installed: false, Error: "no review connectors configured"}
	}
	return r.connectors[0].DetectHost()
}

// ClearRepoCache drops review caches for every connector.
func (r *Registry) ClearRepoCache(repoPath string) {
	for _, c := range r.connectors {
		c.ClearRepoCache(repoPath)
	}
}

// SlotsForUI aggregates UISlot contributions from every registered connector.
func (r *Registry) SlotsForUI(repoPath string) []UISlot {
	var resolved ReviewConnector
	if repoPath != "" {
		resolved, _ = r.Resolve(repoPath)
	}

	out := make([]UISlot, 0, len(r.connectors)*3)
	for _, c := range r.connectors {
		active := resolved != nil && resolved.ID() == c.ID()
		out = append(out, c.UISlots(repoPath, active)...)
	}
	return out
}

// SlotsToMaps serializes slots for Wails events.
func SlotsToMaps(slots []UISlot) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(slots))
	for _, s := range slots {
		entry := map[string]interface{}{
			"slot":        s.Slot,
			"connectorId": s.ConnectorID,
			"visible":     s.Visible,
			"enabled":     s.Enabled,
			"kind":        s.Kind,
		}
		if len(s.Payload) > 0 {
			entry["payload"] = s.Payload
		}
		out = append(out, entry)
	}
	return out
}
