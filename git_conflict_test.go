package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func writeTempFile(t *testing.T, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
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
