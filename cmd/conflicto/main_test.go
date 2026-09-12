package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDarwinAppCandidatesPrefersBundleBinary(t *testing.T) {
	bundleBin := "/Applications/conflicto.app/Contents/MacOS/conflicto"
	candidates := darwinAppCandidates(bundleBin)

	if len(candidates) == 0 || candidates[0] != bundleBin {
		t.Fatalf("darwinAppCandidates() = %v, want %q first", candidates, bundleBin)
	}
}

func TestResolveAppBinaryFromEnv(t *testing.T) {
	dir := t.TempDir()
	appBin := filepath.Join(dir, "conflicto-app")
	if err := os.WriteFile(appBin, []byte("app"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("CONFLICTO_APP", appBin)

	got, err := resolveAppBinary()
	if err != nil {
		t.Fatal(err)
	}
	if got != appBin {
		t.Fatalf("resolveAppBinary() = %q, want %q", got, appBin)
	}
}
