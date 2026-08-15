package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// RecentProject represents a recently opened project
type RecentProject struct {
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	OpenedAt  time.Time `json:"openedAt"`
}

// RecentsManager manages the list of recently opened projects
const maxRecents = 10

type RecentsManager struct {
	projects []RecentProject
}

// recentsFilePath returns the path to the recents file
func recentsFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	configDir := filepath.Join(home, ".config", "conflicto")
	os.MkdirAll(configDir, 0755)

	return filepath.Join(configDir, "recents.json")
}

// NewRecentsManager creates a new RecentsManager and loads existing recents
func NewRecentsManager() *RecentsManager {
	rm := &RecentsManager{}
	rm.Load()
	return rm
}

// Load loads recents from the config file
func (rm *RecentsManager) Load() error {
	path := recentsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		// File doesn't exist yet, that's fine
		return nil
	}

	var projects []RecentProject
	err = json.Unmarshal(data, &projects)
	if err != nil {
		fmt.Println("Error parsing recents:", err)
		return err
	}

	rm.projects = projects
	return nil
}

// Save saves recents to the config file
func (rm *RecentsManager) Save() error {
	path := recentsFilePath()
	data, err := json.MarshalIndent(rm.projects, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// Add adds a project to the recents list, deduplicating and moving to top
func (rm *RecentsManager) Add(path string) {
	name := filepath.Base(path)
	if name == "." || name == "" {
		name = path
	}

	// Remove existing entry for this path if present
	filtered := make([]RecentProject, 0, len(rm.projects))
	for _, p := range rm.projects {
		if p.Path != path {
			filtered = append(filtered, p)
		}
	}

	// Add new entry at the top
	newProject := RecentProject{
		Path:     path,
		Name:     name,
		OpenedAt: time.Now(),
	}
	rm.projects = append([]RecentProject{newProject}, filtered...)

	// Trim to max
	if len(rm.projects) > maxRecents {
		rm.projects = rm.projects[:maxRecents]
	}

	rm.Save()
}

// List returns the current list of recent projects, sorted by most recent first
func (rm *RecentsManager) List() []RecentProject {
	// Return a copy
	result := make([]RecentProject, len(rm.projects))
	copy(result, rm.projects)
	sort.Slice(result, func(i, j int) bool {
		return result[i].OpenedAt.After(result[j].OpenedAt)
	})
	return result
}
