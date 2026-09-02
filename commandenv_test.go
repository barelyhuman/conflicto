package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCommandPathUsesPATH(t *testing.T) {
	dir := t.TempDir()
	tool := filepath.Join(dir, "example-cli")
	if err := os.WriteFile(tool, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	got, err := commandPath("example-cli")
	if err != nil {
		t.Fatal(err)
	}
	if got != tool {
		t.Fatalf("commandPath() = %q, want %q", got, tool)
	}
}

func TestCommandPathReportsMissingTool(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	if _, err := commandPath("definitely-not-installed"); err == nil {
		t.Fatal("commandPath() returned nil error for missing tool")
	}
}
