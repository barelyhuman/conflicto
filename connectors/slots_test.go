package connectors

import (
	"os/exec"
	"testing"
)

func TestRegistry_SlotsForUI_HeaderHiddenWithoutRepo(t *testing.T) {
	gh := NewGitHubConnector(func(name string, args ...string) *exec.Cmd {
		return exec.Command("false")
	})
	reg := NewRegistry(gh)
	slots := reg.SlotsForUI("")

	var headerReviews int
	for _, s := range slots {
		if s.Slot == SlotHeaderReviews && s.Visible {
			headerReviews++
		}
	}
	if headerReviews != 0 {
		t.Fatalf("expected no visible header.reviews without repo, got %d", headerReviews)
	}

	var prefPanels int
	for _, s := range slots {
		if s.Slot == SlotPreferencesPanel && s.Visible {
			prefPanels++
		}
	}
	if prefPanels != 1 {
		t.Fatalf("expected 1 preferences panel slot, got %d", prefPanels)
	}
}

func TestGitHubConnector_UISlots_ActiveRepo(t *testing.T) {
	gh := NewGitHubConnector(func(name string, args ...string) *exec.Cmd {
		return exec.Command(name, args...)
	})
	slots := gh.UISlots("/tmp/myrepo", true)
	reviews := findSlot(slots, SlotHeaderReviews)
	if reviews == nil || !reviews.Visible {
		t.Fatal("expected visible header.reviews when active")
	}
	if reviews.Kind != SlotKindReviewPicker {
		t.Fatalf("kind = %q", reviews.Kind)
	}
}

func findSlot(slots []UISlot, id string) *UISlot {
	for _, s := range slots {
		if s.Slot == id {
			return &s
		}
	}
	return nil
}
