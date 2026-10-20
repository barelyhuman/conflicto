package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestGetFileStatusCollapsesHugeUntrackedDirs(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	if out, err := exec.Command("git", "-C", dir, "init", "-q").CombinedOutput(); err != nil {
		t.Fatal(string(out))
	}
	gs := &GitService{path: dir}

	write := func(rel string) {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	write("a.txt")
	write("src/b.txt")
	_, unstaged, _, err := gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	if len(unstaged) != 2 {
		t.Fatalf("small repo: want 2 individual untracked files, got %d", len(unstaged))
	}

	for i := 0; i <= maxUntrackedListed; i++ {
		write(fmt.Sprintf("node_modules/pkg%d/index.js", i))
	}
	_, unstaged, _, err = gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	if len(unstaged) > 10 {
		t.Fatalf("huge untracked dir should collapse, got %d entries", len(unstaged))
	}
}
