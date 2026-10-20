package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFilesExist(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "src"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "a.go"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	gs := &GitService{path: root}
	got := gs.FilesExist([]string{"src/a.go", "src/missing.go", "src", "../outside.go"})
	want := map[string]bool{"src/a.go": true, "src/missing.go": false, "src": false, "../outside.go": false}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("FilesExist[%q] = %v, want %v", k, got[k], v)
		}
	}
}
