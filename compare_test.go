package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseNameStatusZ(t *testing.T) {
	out := []byte("M\x00a.go\x00R087\x00old.go\x00new.go\x00D\x00gone.go\x00")
	files := parseNameStatusZ(out)
	if len(files) != 3 {
		t.Fatalf("got %d files: %+v", len(files), files)
	}
	if files[1].Status != "R" || files[1].OldPath != "old.go" || files[1].Path != "new.go" {
		t.Fatalf("rename parsed wrong: %+v", files[1])
	}
	if files[2].Status != "D" || files[2].Path != "gone.go" {
		t.Fatalf("delete parsed wrong: %+v", files[2])
	}

	applyNumstatZ(files, []byte("3\t1\ta.go\x001\t2\t\x00old.go\x00new.go\x00-\t-\tgone.go\x00"))
	if files[0].Additions != 3 || files[0].Deletions != 1 {
		t.Fatalf("numstat a.go: %+v", files[0])
	}
	if files[1].Additions != 1 || files[1].Deletions != 2 {
		t.Fatalf("numstat rename: %+v", files[1])
	}
}

func TestParseRefListSkipsRemoteHead(t *testing.T) {
	out := "refs/heads/main\x00main\x00abc\x002026-01-01\x00init\n" +
		"refs/remotes/origin/HEAD\x00origin\x00abc\x002026-01-01\x00init\n" +
		"refs/remotes/origin/main\x00origin/main\x00abc\x002026-01-01\x00init\n" +
		"refs/tags/v1\x00v1\x00abc\x002026-01-01\x00init\n"
	refs := parseRefList(out)
	kinds := []string{}
	for _, r := range refs {
		kinds = append(kinds, r.Kind+":"+r.Name)
	}
	if got := strings.Join(kinds, ","); got != "branch:main,remote:origin/main,tag:v1" {
		t.Fatalf("refs = %s", got)
	}
}

func TestCompareAgainstRef(t *testing.T) {
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
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	run("init", "-q", "-b", "main")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "t")
	write("a.txt", "one\n")
	write("b.txt", "keep\n")
	run("add", ".")
	run("commit", "-q", "-m", "base")
	run("checkout", "-q", "-b", "feature")
	write("a.txt", "one\ntwo\n")
	run("commit", "-q", "-am", "feature change")
	run("checkout", "-q", "main")
	write("b.txt", "keep\nmain only\n")
	run("commit", "-q", "-am", "main change")
	run("checkout", "-q", "feature")
	write("c.txt", "new\n") // untracked

	gs := NewGitService()
	if err := gs.OpenRepo(dir); err != nil {
		t.Fatal(err)
	}

	paths := func(r *CompareResult) string {
		var p []string
		for _, f := range r.Files {
			p = append(p, f.Status+":"+f.Path)
		}
		return strings.Join(p, ",")
	}

	direct, err := gs.CompareFiles("main", false)
	if err != nil {
		t.Fatal(err)
	}
	if got := paths(direct); got != "M:a.txt,M:b.txt,A:c.txt" {
		t.Fatalf("direct compare = %s", got)
	}

	mb, err := gs.CompareFiles("main", true)
	if err != nil {
		t.Fatal(err)
	}
	if got := paths(mb); got != "M:a.txt,A:c.txt" {
		t.Fatalf("merge-base compare = %s", got)
	}

	patch, err := gs.CompareFilePatch(mb.BaseSHA, "a.txt", "", false)
	if err != nil || !strings.Contains(patch.Patch, "+two") {
		t.Fatalf("patch = %+v, %v", patch, err)
	}
	untracked, err := gs.CompareFilePatch(mb.BaseSHA, "c.txt", "", true)
	if err != nil || !strings.Contains(untracked.Patch, "+new") {
		t.Fatalf("untracked patch = %+v, %v", untracked, err)
	}

	contents, err := gs.CompareFileContents(mb.BaseSHA, "a.txt", "")
	if err != nil || contents.OldContent != "one\n" || contents.NewContent != "one\ntwo\n" {
		t.Fatalf("contents = %+v, %v", contents, err)
	}

	if _, err := gs.CompareFiles("--output=x", false); err == nil {
		t.Fatal("option-like ref accepted")
	}
	if _, err := gs.CompareFiles("nope", false); err == nil {
		t.Fatal("unknown ref accepted")
	}

	refs, err := gs.ListRefs()
	if err != nil || len(refs) < 3 || refs[0].Name != "HEAD" {
		t.Fatalf("refs = %+v, %v", refs, err)
	}
}
