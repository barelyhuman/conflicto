package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// newRepoWithWorktree creates a repo with one commit and a linked worktree on branch feat.
func newRepoWithWorktree(t *testing.T, root, name string) (repo, wt string) {
	t.Helper()
	repo = filepath.Join(root, name)
	wt = filepath.Join(root, name+"-wt")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "init", "-q", "-b", "main", ".")
	gitIn(t, repo, "config", "user.email", "t@example.com")
	gitIn(t, repo, "config", "user.name", "t")
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, repo, "add", ".")
	gitIn(t, repo, "commit", "-qm", "base")
	gitIn(t, repo, "worktree", "add", "-q", "-b", "feat", wt)
	gitIn(t, repo, "config", "branch.feat.conflicto-pr", "7")
	return repo, wt
}

func worktreeListed(t *testing.T, repo, path string) bool {
	t.Helper()
	for _, wt := range mustListWorktrees(t, repo) {
		if samePath(wt.Path, path) {
			return true
		}
	}
	return false
}

func mustListWorktrees(t *testing.T, repo string) []WorktreeInfo {
	t.Helper()
	wts, err := (&GitService{path: repo}).ListWorktrees()
	if err != nil {
		t.Fatal(err)
	}
	return wts
}

func prConfigSet(repo, branch string) bool {
	cmd := exec.Command("git", "config", "--get", "branch."+branch+"."+prConfigKey)
	cmd.Dir = repo
	return cmd.Run() == nil
}

func TestRemoveWorktreeOfNonActiveRepo(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	root := realTemp(t)
	repoA, _ := newRepoWithWorktree(t, root, "a")
	repoB, wtB := newRepoWithWorktree(t, root, "b")
	aWorktrees := len(mustListWorktrees(t, repoA))

	// Active project is A; the worktree belongs to B.
	recents := []RecentProject{{Path: repoA}, {Path: repoB}}
	if err := removeWorktreeFromOwner(wtB, recents); err != nil {
		t.Fatalf("remove: %v", err)
	}

	if _, err := os.Stat(wtB); !os.IsNotExist(err) {
		t.Errorf("worktree directory still exists: %v", err)
	}
	if worktreeListed(t, repoB, wtB) {
		t.Errorf("B still lists removed worktree")
	}
	if prConfigSet(repoB, "feat") {
		t.Errorf("branch.feat.conflicto-pr was not unset")
	}
	if got := len(mustListWorktrees(t, repoA)); got != aWorktrees {
		t.Errorf("A worktree count changed: %d -> %d", aWorktrees, got)
	}
}

func TestRemoveWorktreeDirectoryAlreadyDeleted(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	root := realTemp(t)
	repoA, _ := newRepoWithWorktree(t, root, "a")
	repoB, wtB := newRepoWithWorktree(t, root, "b")

	if err := os.RemoveAll(wtB); err != nil {
		t.Fatal(err)
	}

	// Without a recent that knows the worktree, nothing can be resolved.
	if err := removeWorktreeFromOwner(wtB, []RecentProject{{Path: repoA}}); err == nil {
		t.Fatalf("expected error when no candidate repo owns the worktree")
	}

	recents := []RecentProject{{Path: repoA}, {Path: repoB}}
	if err := removeWorktreeFromOwner(wtB, recents); err != nil {
		t.Fatalf("remove stale worktree: %v", err)
	}
	if worktreeListed(t, repoB, wtB) {
		t.Errorf("B still lists pruned worktree")
	}
	if prConfigSet(repoB, "feat") {
		t.Errorf("branch.feat.conflicto-pr was not unset")
	}
	if strings.Contains(gitIn(t, repoB, "worktree", "list", "--porcelain"), wtB) {
		t.Errorf("porcelain output still references removed worktree")
	}
}
