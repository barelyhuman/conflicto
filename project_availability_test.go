package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCheckProjectPath(t *testing.T) {
	root := t.TempDir()

	repo := filepath.Join(root, "repo")
	if err := os.MkdirAll(filepath.Join(repo, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	worktree := filepath.Join(root, "worktree")
	if err := os.MkdirAll(worktree, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(worktree, ".git"), []byte("gitdir: /elsewhere\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	plain := filepath.Join(root, "plain")
	if err := os.MkdirAll(plain, 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	cases := map[string]string{
		repo:                           "ok",
		worktree:                       "ok",
		plain:                          "not-repo",
		file:                           "missing",
		filepath.Join(root, "deleted"): "missing",
	}
	for path, want := range cases {
		if got := checkProjectPath(path); got != want {
			t.Errorf("checkProjectPath(%s) = %q, want %q", filepath.Base(path), got, want)
		}
	}
}

func TestCheckProjectPathsKeepsOrder(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")
	if err := os.MkdirAll(filepath.Join(repo, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "gone")

	got := checkProjectPaths([]string{missing, repo}, time.Second)
	if len(got) != 2 || got[0].Path != missing || got[0].Status != "missing" || got[1].Path != repo || got[1].Status != "ok" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestRecentsRemove(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	rm := &RecentsManager{}
	rm.Add("/a")
	rm.Add("/b")
	if err := rm.Remove("/a"); err != nil {
		t.Fatal(err)
	}
	list := rm.List()
	if len(list) != 1 || list[0].Path != "/b" {
		t.Fatalf("unexpected recents after remove: %+v", list)
	}
}
