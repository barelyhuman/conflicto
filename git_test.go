package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func conflictCodes(conflicts []FileStatus) map[string]string {
	m := make(map[string]string, len(conflicts))
	for _, fs := range conflicts {
		m[fs.Path] = fs.Status
	}
	return m
}

func containsPath(files []FileStatus, path string) bool {
	for _, fs := range files {
		if fs.Path == path {
			return true
		}
	}
	return false
}

func writeTempFile(t *testing.T, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseFileStatusUnmergedCodes(t *testing.T) {
	out := strings.Join([]string{
		"UU both-modified.txt",
		"AA both-added.txt",
		"DD both-deleted.txt",
		"AU added-by-us.txt",
		"UA added-by-them.txt",
		"DU deleted-by-them.txt",
		"UD deleted-by-us.txt",
		"M  staged.txt",
		" M unstaged.txt",
		"?? untracked.txt",
		"R  old-name.txt\tnew-name.txt",
		"",
	}, "\n")

	staged, unstaged, conflicts := parseFileStatus(out, t.TempDir())

	want := map[string]string{
		"both-modified.txt":   "UU",
		"both-added.txt":      "AA",
		"both-deleted.txt":    "DD",
		"added-by-us.txt":     "AU",
		"added-by-them.txt":   "UA",
		"deleted-by-them.txt": "DU",
		"deleted-by-us.txt":   "UD",
	}
	got := conflictCodes(conflicts)
	if len(got) != len(want) {
		t.Fatalf("conflicts = %v, want %v", got, want)
	}
	for path, code := range want {
		if got[path] != code {
			t.Errorf("conflict %s status = %q, want %q", path, got[path], code)
		}
	}

	// AA and DD must not leak into staged/unstaged.
	for _, list := range []string{"both-added.txt", "both-deleted.txt"} {
		if containsPath(staged, list) || containsPath(unstaged, list) {
			t.Errorf("%s leaked out of the conflicts list", list)
		}
	}
	if !containsPath(staged, "staged.txt") {
		t.Errorf("staged.txt missing from staged list")
	}
	if !containsPath(unstaged, "unstaged.txt") {
		t.Errorf("unstaged.txt missing from unstaged list")
	}
	if !containsPath(unstaged, "untracked.txt") {
		t.Errorf("non-conflicted untracked.txt should land in unstaged with status U")
	}

	var renamed *FileStatus
	for i := range staged {
		if staged[i].Path == "new-name.txt" {
			renamed = &staged[i]
		}
	}
	if renamed == nil || renamed.OldPath != "old-name.txt" {
		t.Errorf("rename not parsed with old path: %+v", staged)
	}
}

func TestParseFileStatusUntrackedConflictMarkers(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "conflicted.txt"), []byte("<<<<<<< HEAD\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "plain.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	out := "?? conflicted.txt\n?? plain.txt\n"
	_, unstaged, conflicts := parseFileStatus(out, dir)

	if len(conflicts) != 1 || conflicts[0].Path != "conflicted.txt" || conflicts[0].Status != "C" {
		t.Fatalf("marker-scan conflict = %+v", conflicts)
	}
	if len(unstaged) != 1 || unstaged[0].Path != "plain.txt" {
		t.Fatalf("unstaged = %+v", unstaged)
	}
}

func TestHasConflictMarker(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    bool
	}{
		{"real marker", "<<<<<<< HEAD\nbody\n>>>>>>> other\n", true},
		{"marker no label", "<<<<<<<\n", true},
		{"crlf marker", "<<<<<<< HEAD\r\nbody\r\n", true},
		{"marker mid-line only", "\tif x.Contains(\"<<<<<<<\") {\n", false},
		{"eight chars", "<<<<<<<< not a marker\n", false},
		{"no markers", "plain\ncontent\n", false},
	}
	for _, tc := range cases {
		if got := hasConflictMarker([]byte(tc.content)); got != tc.want {
			t.Errorf("%s: hasConflictMarker = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestParseFileStatusMidLineMarkerNotConflict(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "source.go"), []byte("if strings.Contains(s, \"<<<<<<<\") {\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, unstaged, conflicts := parseFileStatus("?? source.go\n", dir)
	if len(conflicts) != 0 {
		t.Fatalf("mid-line markers must not be flagged as conflicts: %+v", conflicts)
	}
	if len(unstaged) != 1 || unstaged[0].Status != "U" {
		t.Fatalf("unstaged = %+v", unstaged)
	}
}

func TestIsConflict_TextWithMarkers(t *testing.T) {
	path := writeTempFile(t, "main.go", []byte("func main() {\n<<<<<<< HEAD\nold()\n=======\nnew()\n>>>>>>> branch\n}"))
	if !isConflict(path) {
		t.Fatal("text file with conflict markers should be detected as conflict")
	}
}

func TestIsConflict_TextWithoutMarkers(t *testing.T) {
	path := writeTempFile(t, "plain.go", []byte("package main\n\nfunc main() {}\n"))
	if isConflict(path) {
		t.Fatal("text file without conflict markers should not be a conflict")
	}
}

func TestIsConflict_BinaryWithMarkerBytes(t *testing.T) {
	// Compiled binaries can legitimately contain the marker byte sequence —
	// a NUL byte marks the file binary, which must opt out of the scan.
	content := bytes.Repeat([]byte{0x7f, 'E', 'L', 'F', 0}, 100)
	content = append(content, []byte("<<<<<<< HEAD")...)
	content = append(content, 0, 0, 0)
	path := writeTempFile(t, "app", content)
	if isConflict(path) {
		t.Fatal("binary file containing marker bytes should not be a conflict")
	}
}

func TestIsConflict_OversizedSkipped(t *testing.T) {
	content := bytes.Repeat([]byte("<<<<<<< HEAD\n"), (maxConflictScanSize/13)+1)
	path := writeTempFile(t, "huge.txt", content)
	if isConflict(path) {
		t.Fatal("file over maxConflictScanSize should never be scanned as conflict")
	}
}

func TestIsConflict_MissingFile(t *testing.T) {
	if isConflict(filepath.Join(t.TempDir(), "does-not-exist.txt")) {
		t.Fatal("missing file should not be a conflict")
	}
}
