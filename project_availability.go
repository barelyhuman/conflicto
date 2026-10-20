package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ProjectAvailability reports whether a recent project's folder can still be opened.
type ProjectAvailability struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "ok" | "missing" | "not-repo" | "unreadable"
}

// projectCheckTimeout bounds a single path check so an unreachable network
// volume cannot stall the project dropdown.
const projectCheckTimeout = 1500 * time.Millisecond

// checkProjectPath is the cheap per-path check: stat only, no git process.
func checkProjectPath(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "missing"
		}
		return "unreadable"
	}
	if !info.IsDir() {
		return "missing"
	}
	// A worktree has a .git file, a main checkout a .git directory; either is fine.
	if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "not-repo"
		}
		return "unreadable"
	}
	return "ok"
}

// checkProjectPaths checks all paths in parallel. A path whose check does not
// finish within timeout is reported as "unreadable".
func checkProjectPaths(paths []string, timeout time.Duration) []ProjectAvailability {
	out := make([]ProjectAvailability, len(paths))
	var wg sync.WaitGroup
	for i, p := range paths {
		out[i] = ProjectAvailability{Path: p, Status: "unreadable"}
		wg.Add(1)
		go func(i int, p string) {
			defer wg.Done()
			done := make(chan string, 1)
			go func() { done <- checkProjectPath(p) }()
			select {
			case status := <-done:
				out[i].Status = status
			case <-time.After(timeout):
			}
		}(i, p)
	}
	wg.Wait()
	return out
}

// CheckRecentProjects checks, on demand, whether each recent project's folder
// still exists and is a git repository. The project dropdown calls it each
// time it opens.
func (a *App) CheckRecentProjects() []ProjectAvailability {
	if a.recents == nil {
		return []ProjectAvailability{}
	}
	recents := a.recents.List()
	paths := make([]string, len(recents))
	for i, p := range recents {
		paths[i] = p.Path
	}
	return checkProjectPaths(paths, projectCheckTimeout)
}

// RemoveRecentProject drops a project from the recents list.
func (a *App) RemoveRecentProject(path string) error {
	if a.recents == nil {
		return nil
	}
	if err := a.recents.Remove(path); err != nil {
		return err
	}
	a.emitRecentProjectsUpdated()
	return nil
}
