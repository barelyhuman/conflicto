package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveLaunchPathAbsolute(t *testing.T) {
	path, ok := resolveLaunchPath([]string{"/tmp/my-repo"}, "/ignored")
	if !ok {
		t.Fatal("expected path to be resolved")
	}
	if path != "/tmp/my-repo" {
		t.Fatalf("resolveLaunchPath() = %q, want %q", path, "/tmp/my-repo")
	}
}

func TestResolveLaunchPathRelative(t *testing.T) {
	path, ok := resolveLaunchPath([]string{"."}, "/tmp/work")
	if !ok {
		t.Fatal("expected path to be resolved")
	}
	if path != "/tmp/work" {
		t.Fatalf("resolveLaunchPath() = %q, want %q", path, "/tmp/work")
	}
}

func TestResolveLaunchPathSkipsFlags(t *testing.T) {
	path, ok := resolveLaunchPath([]string{"--help", "/repo"}, "")
	if !ok {
		t.Fatal("expected path to be resolved")
	}
	if path != "/repo" {
		t.Fatalf("resolveLaunchPath() = %q, want %q", path, "/repo")
	}
}

func TestResolveLaunchPathEmpty(t *testing.T) {
	if _, ok := resolveLaunchPath(nil, "/tmp"); ok {
		t.Fatal("expected no path for empty args")
	}
}

func TestNormalizeLaunchArgs(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "project")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	origArgs := os.Args
	origWd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		os.Args = origArgs
		_ = os.Chdir(origWd)
	})

	if err := os.Chdir(sub); err != nil {
		t.Fatal(err)
	}

	os.Args = []string{"conflicto", "."}
	normalizeLaunchArgs()

	if len(os.Args) != 2 {
		t.Fatalf("len(os.Args) = %d, want 2", len(os.Args))
	}
	if os.Args[1] != sub {
		t.Fatalf("os.Args[1] = %q, want %q", os.Args[1], sub)
	}
}

func TestLaunchPathFromArgs(t *testing.T) {
	origArgs := os.Args
	t.Cleanup(func() {
		os.Args = origArgs
	})

	os.Args = []string{"conflicto", "/tmp/repo"}
	path, ok := launchPathFromArgs()
	if !ok {
		t.Fatal("expected launch path")
	}
	if path != "/tmp/repo" {
		t.Fatalf("launchPathFromArgs() = %q, want %q", path, "/tmp/repo")
	}
}
