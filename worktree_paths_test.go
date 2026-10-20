package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListWorktreesKeepsPathsWithSpaces(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	repo := filepath.Join(root, "My Projects", "app")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "init", "-q", "-b", "main", ".")
	gitIn(t, repo, "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base")
	wt := filepath.Join(root, "My Projects", "wt dir")
	gitIn(t, repo, "worktree", "add", "-q", "-b", "feat", wt)

	wts, err := (&GitService{path: repo}).ListWorktrees()
	if err != nil {
		t.Fatal(err)
	}
	if len(wts) != 2 || !samePath(wts[0].Path, repo) || !samePath(wts[1].Path, wt) {
		t.Fatalf("worktree paths truncated: %+v", wts)
	}
}

func TestOpenableWorktreeForPRSkipsMissingDirectory(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	repo, wt := newRepoWithWorktree(t, root, "app")
	snaps := snapshotRepos([]RecentProject{{Path: repo}})
	if len(snaps) != 1 {
		t.Fatalf("snaps = %+v", snaps)
	}
	if _, ok := snaps[0].openableWorktreeForPR(7); !ok {
		t.Fatal("expected the existing worktree to be mapped")
	}
	if err := os.RemoveAll(wt); err != nil {
		t.Fatal(err)
	}
	if got, ok := snaps[0].openableWorktreeForPR(7); ok {
		t.Fatalf("deleted worktree %q must not be reused", got)
	}
}

func TestRecentsPathForCollapsesManagedWorktrees(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	repo := filepath.Join(root, "app")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "init", "-q", "-b", "main", ".")
	gitIn(t, repo, "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base")
	gs := &GitService{path: repo}
	wt, _, err := gs.NewWorktreePath()
	if err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "worktree", "add", "-q", "-b", "pr-wt-x", wt)

	if got := (&GitService{path: wt}).recentsPath(); !samePath(got, repo) {
		t.Errorf("managed worktree recents path = %q, want main repo %q", got, repo)
	}
	if got := gs.recentsPath(); !samePath(got, repo) {
		t.Errorf("main repo recents path = %q", got)
	}
	plain := filepath.Join(root, "plain-wt")
	gitIn(t, repo, "worktree", "add", "-q", "-b", "plain", plain)
	if got := (&GitService{path: plain}).recentsPath(); !samePath(got, plain) {
		t.Errorf("user worktree should stay as opened, got %q", got)
	}
}
