package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// A repository's node_modules/.bin may be attacker-controlled; text search must not run it.
func TestSearchTextDoesNotRunRepoLocalRipgrep(t *testing.T) {
	root := t.TempDir()
	gitIn(t, root, "init", "-q", "-b", "main", ".")
	if err := os.WriteFile(filepath.Join(root, "f.txt"), []byte("needle\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitIn(t, root, "add", ".")

	marker := filepath.Join(t.TempDir(), "ran")
	bin := filepath.Join(root, "node_modules", ".bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\ntouch '" + marker + "'\n"
	if err := os.WriteFile(filepath.Join(bin, "rg"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := searchText(context.Background(), root, SearchOpts{Query: "needle"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("search executed the repo-local node_modules/.bin/rg")
	}
}
