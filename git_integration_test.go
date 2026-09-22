package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestConflictIntegration(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	runAllowFail := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		_, _ = cmd.CombinedOutput()
	}
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	run("init", "-q", "-b", "master", ".")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "test")

	write("f.txt", "a\nb\nc\n")
	write("del.txt", "x\ny\n")
	run("add", ".")
	run("commit", "-qm", "base")

	findConflict := func(conflicts []FileStatus, path string) (FileStatus, bool) {
		for _, fs := range conflicts {
			if fs.Path == path {
				return fs, true
			}
		}
		return FileStatus{}, false
	}

	// --- UU: both modify the same line
	run("checkout", "-qb", "uu")
	write("f.txt", "a\nB-branch\nc\n")
	run("commit", "-qam", "uu-branch")
	run("checkout", "-q", "master")
	write("f.txt", "a\nB-master\nc\n")
	run("commit", "-qam", "uu-master")
	runAllowFail("merge", "uu")

	gs := &GitService{path: dir}
	staged, unstaged, conflicts, err := gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	fs, ok := findConflict(conflicts, "f.txt")
	if !ok || fs.Status != "UU" {
		t.Fatalf("f.txt conflict = %+v (all conflicts: %+v)", fs, conflicts)
	}
	if containsPath(staged, "f.txt") || containsPath(unstaged, "f.txt") {
		t.Errorf("UU f.txt leaked into staged/unstaged lists")
	}
	cf, err := gs.GetConflictFile("f.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !cf.HasWorktree || !cf.HasOurs || !cf.HasTheirs {
		t.Errorf("UU stages = %+v", cf)
	}
	if !strings.Contains(cf.Worktree, "<<<<<<<") {
		t.Errorf("UU worktree missing markers: %q", cf.Worktree)
	}
	runAllowFail("merge", "--abort")

	// --- UD: we modified, they deleted ("deleted by them")
	run("checkout", "-qb", "they-delete")
	run("rm", "-q", "del.txt")
	run("commit", "-qm", "they-delete")
	run("checkout", "-q", "master")
	write("del.txt", "x\ny-modified\n")
	run("commit", "-qam", "we-modify")
	runAllowFail("merge", "they-delete")

	_, _, conflicts, err = gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	fs, ok = findConflict(conflicts, "del.txt")
	if !ok || fs.Status != "UD" {
		t.Fatalf("del.txt conflict = %+v (all conflicts: %+v)", fs, conflicts)
	}
	cf, err = gs.GetConflictFile("del.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !cf.HasWorktree || !cf.HasOurs || cf.HasTheirs {
		t.Errorf("UD stages = %+v", cf)
	}
	if !strings.Contains(cf.Worktree, "y-modified") {
		t.Errorf("UD worktree should hold our version: %q", cf.Worktree)
	}
	if strings.Contains(cf.Worktree, "<<<<<<<") {
		t.Errorf("UD worktree should have no markers: %q", cf.Worktree)
	}
	runAllowFail("merge", "--abort")

	// --- DU: we deleted, they modified ("deleted by us")
	run("checkout", "-qb", "they-modify")
	write("del.txt", "x\ny-branch-mod\n")
	run("commit", "-qam", "they-modify")
	run("checkout", "-q", "master")
	run("rm", "-q", "del.txt")
	run("commit", "-qm", "we-delete")
	runAllowFail("merge", "they-modify")

	_, _, conflicts, err = gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	fs, ok = findConflict(conflicts, "del.txt")
	if !ok || fs.Status != "DU" {
		t.Fatalf("del.txt conflict = %+v (all conflicts: %+v)", fs, conflicts)
	}
	cf, err = gs.GetConflictFile("del.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !cf.HasWorktree || cf.HasOurs || !cf.HasTheirs {
		t.Errorf("DU stages = %+v", cf)
	}
	if !strings.Contains(cf.Worktree, "y-branch-mod") {
		t.Errorf("DU worktree should hold their version: %q", cf.Worktree)
	}
	runAllowFail("merge", "--abort")

	// --- AA: both add the same new file
	run("checkout", "-qb", "add-branch")
	write("g.txt", "branch version\n")
	run("add", "g.txt")
	run("commit", "-qm", "add-branch")
	run("checkout", "-q", "master")
	write("g.txt", "master version\n")
	run("add", "g.txt")
	run("commit", "-qm", "add-master")
	runAllowFail("merge", "add-branch")

	_, _, conflicts, err = gs.GetFileStatus()
	if err != nil {
		t.Fatal(err)
	}
	fs, ok = findConflict(conflicts, "g.txt")
	if !ok || fs.Status != "AA" {
		t.Fatalf("g.txt conflict = %+v (all conflicts: %+v)", fs, conflicts)
	}
	cf, err = gs.GetConflictFile("g.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !cf.HasWorktree || !cf.HasOurs || !cf.HasTheirs {
		t.Errorf("AA stages = %+v", cf)
	}
	if !strings.Contains(cf.Worktree, "<<<<<<<") {
		t.Errorf("AA worktree missing markers: %q", cf.Worktree)
	}
	runAllowFail("merge", "--abort")
}
