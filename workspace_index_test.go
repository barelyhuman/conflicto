package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestParsePREntryID(t *testing.T) {
	id := prEntryID("/a/b#c/repo", 36)
	if id != "pr:/a/b#c/repo#36" {
		t.Fatalf("id = %q", id)
	}
	repo, n, ok := parsePREntryID(id)
	if !ok || repo != "/a/b#c/repo" || n != 36 {
		t.Fatalf("parse = %q %d %v", repo, n, ok)
	}
	for _, bad := range []string{"repo:/x", "pr:/x", "pr:/x#abc", "pr:/x#0"} {
		if _, _, ok := parsePREntryID(bad); ok {
			t.Errorf("%q should not parse", bad)
		}
	}
}

func testSnapshot() repoSnapshot {
	return repoSnapshot{
		Path: "/r/app", Name: "app", Branch: "main",
		Worktrees: []WorktreeInfo{
			{Path: "/r/app", Branch: "main", IsMain: true},
			{Path: "/w/app/aa", Branch: "pr-wt-aa"},  // PR 1, open
			{Path: "/w/app/bb", Branch: "pr-wt-bb"},  // PR 2, merged
			{Path: "/w/app/cc", Branch: "feature-x"}, // plain
		},
		WTPR:     map[string]int{"pr-wt-aa": 1, "pr-wt-bb": 2},
		ModTimes: map[string]time.Time{},
	}
}

func TestBuildWorkspaceEntries(t *testing.T) {
	cache := workspaceCache{Repos: map[string]repoPRCache{
		"/r/app": {
			Open: []cachedPR{
				{Number: 1, Title: "One", HeadRef: "one", Author: "al", UpdatedAt: "2026-01-01T00:00:00Z"},
				{Number: 3, Title: "Three", HeadRef: "three", Author: "bo"},
			},
			States: map[int]string{2: "MERGED"},
		},
	}}
	entries := buildWorkspaceEntries([]repoSnapshot{testSnapshot()}, cache, "/w/app/aa")
	byID := map[string]WorkspaceEntry{}
	for _, e := range entries {
		byID[e.ID] = e
	}
	// 1 repo + 3 worktrees + 2 PRs
	if len(entries) != 6 {
		t.Fatalf("got %d entries", len(entries))
	}
	if e := byID["repo:/r/app"]; e.Kind != "repo" || e.Active || e.Path != "/r/app" {
		t.Errorf("repo entry %+v", e)
	}
	wt1 := byID["wt:/w/app/aa"]
	if wt1.PRNumber != 1 || wt1.PRState != "OPEN" || wt1.Stale || !wt1.Active || wt1.Title != "One" {
		t.Errorf("wt1 %+v", wt1)
	}
	wt2 := byID["wt:/w/app/bb"]
	if wt2.PRNumber != 2 || wt2.PRState != "MERGED" || !wt2.Stale {
		t.Errorf("wt2 %+v", wt2)
	}
	wt3 := byID["wt:/w/app/cc"]
	if wt3.PRNumber != 0 || wt3.Stale || wt3.Title != "feature-x" {
		t.Errorf("wt3 %+v", wt3)
	}
	pr1 := byID["pr:/r/app#1"]
	if !pr1.HasWorktree || pr1.Path != "/w/app/aa" || !pr1.Active || pr1.PRState != "OPEN" {
		t.Errorf("pr1 %+v", pr1)
	}
	pr3 := byID["pr:/r/app#3"]
	if pr3.HasWorktree || pr3.Path != "" || pr3.Active {
		t.Errorf("pr3 %+v", pr3)
	}
}

func TestPRStateFor(t *testing.T) {
	rc := repoPRCache{Open: []cachedPR{{Number: 5}}, States: map[int]string{5: "CLOSED", 6: "CLOSED"}}
	if prStateFor(rc, 5) != "OPEN" || prStateFor(rc, 6) != "CLOSED" || prStateFor(rc, 7) != "" {
		t.Error("unexpected states")
	}
	if !isStaleState("MERGED") || !isStaleState("CLOSED") || isStaleState("OPEN") || isStaleState("") {
		t.Error("isStaleState wrong")
	}
}

func gitIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

func realTemp(t *testing.T) string {
	t.Helper()
	d, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// setupRepoWithRemote creates a repo whose origin has refs/pull/1/head.
func setupRepoWithRemote(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	root := realTemp(t)
	remote := filepath.Join(root, "remote.git")
	repo := filepath.Join(root, "app")
	gitIn(t, root, "init", "-q", "--bare", "-b", "main", remote)
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "init", "-q", "-b", "main", ".")
	gitIn(t, repo, "config", "user.email", "t@example.com")
	gitIn(t, repo, "config", "user.name", "t")
	gitIn(t, repo, "remote", "add", "origin", remote)
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "add", ".")
	gitIn(t, repo, "commit", "-qm", "base")
	gitIn(t, repo, "push", "-q", "origin", "main", "main:refs/pull/1/head", "main:refs/pull/2/head")
	return repo
}

func TestWorkspaceIndexIntegration(t *testing.T) {
	repo := setupRepoWithRemote(t)
	gs := &GitService{path: repo}

	p1, err := createPRWorktree(gs, 1, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	p2, err := createPRWorktree(gs, 2, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	plain := filepath.Join(filepath.Dir(repo), "plain-wt")
	gitIn(t, repo, "worktree", "add", "-q", "-b", "feature", plain)

	// Recents include a worktree path; it must collapse into the main repo.
	recents := []RecentProject{{Path: p1, OpenedAt: time.Now()}, {Path: repo}, {Path: "/does/not/exist"}}
	snaps := snapshotRepos(recents)
	if len(snaps) != 1 || snaps[0].Path != repo {
		t.Fatalf("snaps = %+v", snaps)
	}
	if got, ok := snaps[0].worktreeForPR(1); !ok || got != p1 {
		t.Errorf("PR1 worktree = %q %v, want %q", got, ok, p1)
	}
	if got, ok := snaps[0].worktreeForPR(2); !ok || got != p2 {
		t.Errorf("PR2 worktree = %q %v, want %q", got, ok, p2)
	}
	if _, ok := snaps[0].worktreeForPR(3); ok {
		t.Error("PR3 should have no worktree")
	}

	var listCalls, stateCalls atomic.Int32
	origList, origState := ghListOpenPRs, ghPRState
	defer func() { ghListOpenPRs, ghPRState = origList, origState }()
	ghListOpenPRs = func(string) ([]cachedPR, error) {
		listCalls.Add(1)
		return []cachedPR{{Number: 1, Title: "One", HeadRef: "one", Author: "al"}, {Number: 9, Title: "Nine", Author: "bo"}}, nil
	}
	ghPRState = func(_ string, n int) (string, error) {
		stateCalls.Add(1)
		return "MERGED", nil
	}

	cacheFile := filepath.Join(realTemp(t), "idx.json")
	wi := newWorkspaceIndex(cacheFile)
	wi.refreshing = true
	wi.refresh(snaps)
	if listCalls.Load() != 1 || stateCalls.Load() != 1 {
		t.Fatalf("calls list=%d state=%d", listCalls.Load(), stateCalls.Load())
	}
	if wi.refreshing {
		t.Error("refreshing flag not cleared")
	}

	// Persisted and reloadable.
	reloaded := newWorkspaceIndex(cacheFile)
	if reloaded.snapshotCache().FetchedAt.IsZero() {
		t.Fatal("cache not persisted")
	}

	entries := buildWorkspaceEntries(snaps, reloaded.snapshotCache(), p1)
	byID := map[string]WorkspaceEntry{}
	for _, e := range entries {
		byID[e.ID] = e
	}
	if e := byID["wt:"+p1]; e.PRState != "OPEN" || e.Stale || !e.Active {
		t.Errorf("wt1 %+v", e)
	}
	if e := byID["wt:"+p2]; e.PRState != "MERGED" || !e.Stale {
		t.Errorf("wt2 %+v", e)
	}
	if e := byID["wt:"+plain]; e.PRNumber != 0 || e.Stale {
		t.Errorf("plain %+v", e)
	}
	if e := byID["pr:"+repo+"#9"]; e.HasWorktree || e.Path != "" {
		t.Errorf("pr9 %+v", e)
	}
	if e := byID["pr:"+repo+"#1"]; !e.HasWorktree || e.Path != p1 {
		t.Errorf("pr1 %+v", e)
	}
}

func TestRefreshKeepsCacheOnGHFailure(t *testing.T) {
	origList := ghListOpenPRs
	defer func() { ghListOpenPRs = origList }()
	ghListOpenPRs = func(string) ([]cachedPR, error) { return nil, os.ErrNotExist }

	wi := newWorkspaceIndex("")
	wi.cache.Repos["/r/app"] = repoPRCache{Open: []cachedPR{{Number: 1}}}
	wi.refresh([]repoSnapshot{{Path: "/r/app", WTPR: map[string]int{}}})
	if len(wi.cache.Repos["/r/app"].Open) != 1 {
		t.Error("cached PRs dropped on gh failure")
	}
}

func TestOpenWorkspaceInvalid(t *testing.T) {
	a := NewApp()
	if err := a.OpenWorkspace("bogus"); err == nil {
		t.Error("expected error for bogus id")
	}
	if err := a.OpenWorkspace("wt:/definitely/not/here"); err == nil {
		t.Error("expected error for missing path")
	}
}
